import { NextRequest, NextResponse } from 'next/server';

// Import the helpers from the parent route
import { getSubmissionById, getSubmissions } from '../helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    if (!id) {
      return NextResponse.json({ 
        success: false,
        error: 'Submission ID is required' 
      }, { status: 400 });
    }
    
    console.log(`Fetching submission with ID: ${id}`);
    
    // Try to get the submission directly by ID
    const submission = getSubmissionById(id);
    
    // If not found, also try the general list as a fallback
    if (!submission) {
      console.log(`Submission with ID ${id} not found in detail map, checking general list`);
      const allSubmissions = getSubmissions();
      console.log(`Total submissions available in general list: ${allSubmissions.length}`);
      
      // Log available IDs for debugging
      if (allSubmissions.length > 0) {
        console.log(`Available IDs: ${allSubmissions.map(s => s.id).join(', ')}`);
      }
      
      return NextResponse.json({ 
        success: false,
        error: 'Submission not found' 
      }, { status: 404 });
    }
    
    console.log(`Found submission: ${submission.title || 'Untitled'}`);
    
    // Make sure key properties are properly formatted
    const formattedSubmission = {
      ...submission,
      // Ensure score is a number
      score: typeof submission.score === 'number' ? submission.score : 
             typeof submission.score === 'string' ? parseFloat(submission.score) : 0,
      // Ensure date is formatted
      createdAt: submission.createdAt || new Date().toISOString(),
      // Ensure we have productData
      productData: submission.productData || { competitors: [] },
      // Ensure we have metrics
      metrics: submission.metrics || {},
      // Ensure we have marketInsights
      marketInsights: submission.marketInsights || 'No insights available for this analysis.'
    };
    
    return NextResponse.json({ 
      success: true,
      submission: formattedSubmission
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch submission' 
    }, { status: 500 });
  }
} 