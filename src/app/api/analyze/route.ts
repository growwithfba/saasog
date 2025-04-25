import { NextRequest, NextResponse } from 'next/server';
import { loadSubmissions, saveSubmissions, getSubmissionById } from './helpers';
import { cookies } from 'next/headers';

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

// Add a function to strip down the Keepa results to only essential data
// This will significantly reduce the cookie size

// Define interface for reduced Keepa data
interface ReducedKeepaData {
  asin: string;
  analysis: {
    bsr: {
      stability: number;
      trend: {
        direction: string;
        strength: number;
      };
    };
    price: {
      stability: number;
      trend: {
        direction: string;
        strength: number;
      };
    };
    competitivePosition: {
      score: number;
    };
  };
  productData?: {
    bsrSummary?: {
      min: number;
      max: number;
      avg: number;
      count: number;
      current: number;
    };
    priceSummary?: {
      min: number;
      max: number;
      avg: number;
      count: number;
      current: number;
    };
  };
}

function reduceKeepaData(keepaResults: any[]): ReducedKeepaData[] {
  if (!keepaResults || !Array.isArray(keepaResults)) return [];
  
  return keepaResults.map(keepaResult => {
    // Only keep essential fields from the keepa analysis
    const essentialData: ReducedKeepaData = {
      asin: keepaResult.asin,
      analysis: {
        bsr: {
          stability: keepaResult.analysis?.bsr?.stability || 0.5,
          trend: {
            direction: keepaResult.analysis?.bsr?.trend?.direction || 'stable',
            strength: keepaResult.analysis?.bsr?.trend?.strength || 0
          }
        },
        price: {
          stability: keepaResult.analysis?.price?.stability || 0.5,
          trend: {
            direction: keepaResult.analysis?.price?.trend?.direction || 'stable',
            strength: keepaResult.analysis?.price?.trend?.strength || 0
          }
        },
        competitivePosition: {
          score: keepaResult.analysis?.competitivePosition?.score || 5
        }
      }
    };
    
    // Only include essential time series data - instead of all data points
    if (keepaResult.productData) {
      essentialData.productData = {};
      
      // For BSR and price data, only keep summary statistics instead of all data points
      const bsrData = keepaResult.productData.bsr || [];
      const priceData = keepaResult.productData.prices || [];
      
      if (bsrData.length > 0) {
        const bsrValues = bsrData.map((point: any) => point.value);
        essentialData.productData.bsrSummary = {
          min: Math.min(...bsrValues),
          max: Math.max(...bsrValues),
          avg: bsrValues.reduce((sum: number, val: number) => sum + val, 0) / bsrValues.length,
          count: bsrValues.length,
          current: bsrData.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]?.value || 0
        };
      }
      
      if (priceData.length > 0) {
        const priceValues = priceData.map((point: any) => point.value);
        essentialData.productData.priceSummary = {
          min: Math.min(...priceValues) / 100, // Convert to dollars
          max: Math.max(...priceValues) / 100,
          avg: (priceValues.reduce((sum: number, val: number) => sum + val, 0) / priceValues.length) / 100,
          count: priceValues.length,
          current: (priceData.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]?.value || 0) / 100
        };
      }
    }
    
    return essentialData;
  });
}

async function handleSubmission(request: NextRequest) {
  try {
    const data = await request.json();
    const { userId, title, score, status, productData, keepaResults, marketScore, productName } = data;
    
    // Generate unique ID
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Reduce Keepa data size to prevent cookie overflow
    const reducedKeepaResults = reduceKeepaData(keepaResults || []);
    
    // Create submission with reduced Keepa data
    const submission = {
      id: submissionId,
      userId,
      title,
      score,
      status,
      productData,
      keepaResults: reducedKeepaResults, // Use reduced data
      marketScore,
      productName,
      createdAt: new Date().toISOString()
    };

    // Save submission
    saveSubmissions([...loadSubmissions(), submission]);

    // Return success response
    return NextResponse.json({ success: true, id: submissionId }, { status: 201 });
  } catch (error) {
    console.error('Error saving submission:', error);
    return NextResponse.json({ success: false, error: 'Failed to save submission' }, { status: 500 });
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