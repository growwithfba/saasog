import { NextRequest, NextResponse } from 'next/server';
import { loadSubmissions, saveSubmissions, getSubmissionById } from './helpers';

export async function POST(request: NextRequest) {
  try {
    // Check if the request is a form (CSV file upload) or JSON (submission)
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      return handleCSVAnalysis(request);
    } else {
      return handleSubmission(request);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function handleCSVAnalysis(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split('\n').slice(1); // Skip header row
    
    // Process CSV data
    const results = lines
      .filter(line => line.trim()) // Remove empty lines
      .map(line => {
        const columns = line.split(',');
        return {
          title: columns[0]?.trim() || '',
          price: parseFloat(columns[8]?.trim() || '0'),
          monthlySales: parseInt(columns[9]?.trim() || '0', 10),
          monthlyRevenue: parseFloat(columns[9]?.trim() || '0'),
          rating: parseFloat(columns[4]?.trim() || '0'),
          reviews: parseInt(columns[5]?.trim() || '0', 10),
          score: parseFloat(columns[6]?.trim() || '0'),
          recommendation: 'Average' // Default value
        };
      });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error processing CSV:', error);
    return NextResponse.json(
      { error: 'Failed to process CSV file' },
      { status: 500 }
    );
  }
}

async function handleSubmission(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate the submission data
    if (!data.userId) {
      return NextResponse.json({ 
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    if (!data.productData || !Array.isArray(data.productData.competitors) || data.productData.competitors.length === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Product data with competitors is required'
      }, { status: 400 });
    }
    
    // Use the ID provided from client if available, otherwise generate new one
    const submissionId = data.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Use the actual calculated score and status from marketScore object
    const score = data.marketScore && typeof data.marketScore.score === 'number' 
      ? data.marketScore.score 
      : typeof data.score === 'number' 
          ? data.score 
          : 0;
    
    const status = data.marketScore?.status || data.status || 'N/A';
    
    // Normalize the submission data
    const submission = {
      id: submissionId,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      score: score,
      status: status,
      userId: data.userId,
      title: data.title || 'Untitled Analysis',
      productData: data.productData,
      keepaResults: data.keepaResults || [],
      marketScore: data.marketScore || { score, status },
      metrics: data.metrics || {
        calculatedAt: new Date().toISOString()
      },
      marketInsights: data.marketInsights || '',
      fromSaveCalculation: data.fromSaveCalculation || false,
      fromUpload: data.fromUpload || false
    };
    
    // Load existing submissions
    let submissions = loadSubmissions();
    
    // First check if this is a duplicate submission based on ID
    const existingByIdIndex = submissions.findIndex(sub => sub.id === submissionId);
    
    if (existingByIdIndex >= 0) {
      // Update existing submission
      submissions[existingByIdIndex] = submission;
      console.log(`Updated existing submission with ID: ${submissionId}`);
    } else {
      // Check if this is likely a duplicate based on title and userId
      // We only do this when NOT explicitly coming from the "Save Calculation" button
      if (!data.fromSaveCalculation) {
        const existingByTitleIndex = submissions.findIndex(sub => 
          sub.userId === data.userId && 
          sub.title === data.title &&
          // Only consider it a duplicate if statuses match
          sub.status === status
        );
        
        if (existingByTitleIndex >= 0) {
          // This is likely a duplicate, so update the existing record instead
          const existingId = submissions[existingByTitleIndex].id;
          // Preserve the original ID and creation date
          submission.id = existingId;
          submission.createdAt = submissions[existingByTitleIndex].createdAt;
          submissions[existingByTitleIndex] = submission;
          console.log(`Prevented duplicate: Updated submission with title "${data.title}" instead of creating new one`);
        } else {
          // This is a new submission
          submissions.push(submission);
          console.log(`Added new submission with ID: ${submissionId}`);
        }
      } else {
        // This is from the Save Calculation button, so add it as a new submission
        submissions.push(submission);
        console.log(`Added new submission from Save Calculation with ID: ${submissionId}`);
      }
    }
    
    // Create a response with the cookie
    const response = NextResponse.json({ 
      success: true, 
      submission,
      message: 'Analysis saved successfully'
    });
    
    // Add the submission data to the cookie
    saveSubmissions(response, submissions);
    
    return response;
  } catch (error) {
    console.error('Error saving submission:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save submission' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ 
        success: false,
        error: 'User ID is required' 
      }, { status: 400 });
    }
    
    // Load all submissions to make sure we have the latest
    const submissions = loadSubmissions();
    
    console.log(`Loaded ${submissions.length} total submissions`);
    
    // Filter submissions by user ID
    const userSubmissions = submissions.filter(
      sub => sub.userId === userId
    );
    
    console.log(`Found ${userSubmissions.length} submissions for user ${userId}`);
    
    // Sort submissions by creation date (newest first)
    userSubmissions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Create response
    const response = NextResponse.json({ 
      success: true,
      submissions: userSubmissions 
    });
    
    // Save current state to cookies too
    saveSubmissions(response, submissions);
    
    return response;
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch submissions' 
    }, { status: 500 });
  }
} 