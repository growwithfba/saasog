import { NextRequest, NextResponse } from 'next/server'
import { loadSubmissions, saveSubmissions, getSubmissionById } from './helpers'
import { cookies } from 'next/headers'
import { supabase, ensureAnonymousSession } from '@/utils/supabaseClient'

export async function POST(request: NextRequest) {
  try {
    // Check if the request is a form (CSV file upload) or JSON (submission)
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      return handleCSVAnalysis(request)
    } else {
      return handleSubmission(request)
    }
  } catch (error) {
    console.error('Error processing request:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

async function handleCSVAnalysis(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const lines = text.split('\n').slice(1) // Skip header row

    // Process CSV data
    const results = lines
      .filter(line => line.trim()) // Remove empty lines
      .map(line => {
        const columns = line.split(',')
        return {
          title: columns[0]?.trim() || '',
          price: parseFloat(columns[8]?.trim() || '0'),
          monthlySales: parseInt(columns[9]?.trim() || '0', 10),
          monthlyRevenue: parseFloat(columns[9]?.trim() || '0'),
          rating: parseFloat(columns[4]?.trim() || '0'),
          reviews: parseInt(columns[5]?.trim() || '0', 10),
          score: parseFloat(columns[6]?.trim() || '0'),
          recommendation: 'Average' // Default value
        }
      })

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error processing CSV:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV file' },
      { status: 500 }
    )
  }
}

// Define interface for reduced Keepa data
interface ReducedKeepaData {
  asin: string
  analysis: {
    bsr: {
      stability: number
      trend: { direction: string; strength: number }
    }
    price: {
      stability: number
      trend: { direction: string; strength: number }
    }
    competitivePosition: { score: number }
  }
  productData?: {
    bsrSummary?: { min: number; max: number; avg: number; count: number; current: number }
    priceSummary?: { min: number; max: number; avg: number; count: number; current: number }
  }
}

function reduceKeepaData(keepaResults: any[]): ReducedKeepaData[] {
  if (!Array.isArray(keepaResults)) return []

  return keepaResults.map(keepaResult => {
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
    }

    if (keepaResult.productData) {
      essentialData.productData = {}

      const bsrData = keepaResult.productData.bsr || []
      const priceData = keepaResult.productData.prices || []

      if (bsrData.length) {
        const bsrValues = bsrData.map((p: any) => p.value)
        essentialData.productData.bsrSummary = {
          min: Math.min(...bsrValues),
          max: Math.max(...bsrValues),
          avg: bsrValues.reduce((s, v) => s + v, 0) / bsrValues.length,
          count: bsrValues.length,
          current: bsrData.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]?.value || 0
        }
      }

      if (priceData.length) {
        const priceValues = priceData.map((p: any) => p.value)
        essentialData.productData.priceSummary = {
          min: Math.min(...priceValues) / 100,
          max: Math.max(...priceValues) / 100,
          avg: priceValues.reduce((s, v) => s + v, 0) / priceValues.length / 100,
          count: priceValues.length,
          current: (priceData.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]?.value || 0) / 100
        }
      }
    }

    return essentialData
  })
}

async function handleSubmission(request: NextRequest) {
  try {
    const data = await request.json()
    const { userId, title, score, status, productData, keepaResults, marketScore, productName } = data

    console.log('API: Processing submission for user ID:', userId);
    console.log('API: Submission data summary:', { 
      title, 
      productName, 
      score, 
      status, 
      hasProductData: !!productData,
      hasKeepaResults: !!keepaResults && keepaResults.length > 0
    });

    // Generate unique ID (will be overwritten by Supabase's auto-generation)
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // Reduce Keepa data size to prevent data size issues
    const reducedKeepaResults = reduceKeepaData(keepaResults || [])

    // For server-side operations, we need to use the service role client
    // or get the user ID from the request headers/session
    let actualUserId = userId;
    
    // Try to get the authenticated user from the session
    const { data: authData, error: authError } = await supabase.auth.getUser()
    
    if (authData.user) {
      actualUserId = authData.user.id;
      console.log('Using authenticated user ID:', actualUserId);
    } else {
      console.log('No authenticated user found, using provided userId:', userId);
      // If no auth user, we'll still try to save with the provided userId
      // This handles cases where the user ID comes from the client
    }
    
    // Log Supabase connection check
    const connectionCheck = await supabase.from('submissions').select('count');
    console.log('API: Supabase connection check:', { 
      success: !connectionCheck.error,
      error: connectionCheck.error
    });

    console.log('API: Attempting to save to Supabase with user ID:', actualUserId);
    
    // Then use this ID for the submission
    const submissionPayload = {
      user_id: actualUserId,
      title: title || productName || 'Untitled Analysis',
      product_name: productName || title || 'Untitled Product',
      score: score,
      status: status,
      submission_data: {
        productData,
        keepaResults: reducedKeepaResults,
        marketScore,
        createdAt: new Date().toISOString()
      }
    };
    
    console.log('API: Supabase insert data structure:', {
      user_id: submissionPayload.user_id,
      title: submissionPayload.title,
      product_name: submissionPayload.product_name
    });
    
    // Try to insert into Supabase
    const { data: supabaseData, error } = await supabase
      .from('submissions')
      .insert(submissionPayload)
      .select()

    if (error) {
      console.error('Supabase error saving submission:', error)
      console.error('Supabase error details:', JSON.stringify(error))
      
      // Return the error instead of falling back to cookies
      // This way we can debug what's wrong with the Supabase insert
      return NextResponse.json({
        success: false,
        error: 'Failed to save to database: ' + error.message,
        details: error
      }, { status: 500 })
    }

    const savedSubmission = supabaseData[0]
    console.log('Successfully saved submission to Supabase:', savedSubmission.id)

    return NextResponse.json({ 
      success: true, 
      id: savedSubmission.id 
    }, { status: 201 })
  } catch (error) {
    console.error('Error saving submission:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save submission' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      )
    }
    
    let result = {
      success: true,
      submissions: [] as any[],
      source: 'combined'
    };

    // Try to get current anonymous session ID
    let anonymousId = null;
    try {
      // First check if there's a session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && sessionData.session?.user?.id) {
        anonymousId = sessionData.session.user.id;
        console.log('Anonymous session found in API:', anonymousId);
      } else {
        // If no session, try to create one
        const sessionCreated = await ensureAnonymousSession();
        if (sessionCreated) {
          const { data: newSessionData } = await supabase.auth.getSession();
          if (newSessionData.session?.user?.id) {
            anonymousId = newSessionData.session.user.id;
            console.log('New anonymous session created:', anonymousId);
          }
        }
      }
    } catch (sessionError) {
      console.error('Error getting anonymous session:', sessionError);
    }

    // Try to get submissions from Supabase first with the provided userId
    try {
      const { data: supabaseSubmissions, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (!error && supabaseSubmissions && supabaseSubmissions.length > 0) {
        // Transform Supabase data format to match the expected format in the frontend
        const transformedSubmissions = supabaseSubmissions.map(sub => ({
          id: sub.id,
          userId: sub.user_id,
          title: sub.title,
          score: sub.score,
          status: sub.status,
          productName: sub.product_name,
          createdAt: sub.created_at,
          productData: sub.submission_data?.productData || {},
          keepaResults: sub.submission_data?.keepaResults || [],
          marketScore: sub.submission_data?.marketScore || 0
        }))
        
        result.submissions = transformedSubmissions;
        result.source = 'supabase';
        console.log(`Retrieved ${transformedSubmissions.length} submissions from Supabase with user ID`);
      }
    } catch (supabaseError) {
      console.error('Supabase error fetching submissions with userId:', supabaseError)
    }
    
    // If we have an anonymous ID and it's different from the provided userId,
    // also try to fetch submissions with the anonymous ID
    if (anonymousId && anonymousId !== userId) {
      try {
        const { data: anonymousSubmissions, error } = await supabase
          .from('submissions')
          .select('*')
          .eq('user_id', anonymousId)
          .order('created_at', { ascending: false })
  
        if (!error && anonymousSubmissions && anonymousSubmissions.length > 0) {
          // Transform Supabase data
          const transformedSubmissions = anonymousSubmissions.map(sub => ({
            id: sub.id,
            userId: sub.user_id,
            title: sub.title,
            score: sub.score,
            status: sub.status,
            productName: sub.product_name,
            createdAt: sub.created_at,
            productData: sub.submission_data?.productData || {},
            keepaResults: sub.submission_data?.keepaResults || [],
            marketScore: sub.submission_data?.marketScore || 0
          }))
          
          // Add them to our results
          result.submissions = [...result.submissions, ...transformedSubmissions];
          result.source = 'combined';
          console.log(`Retrieved ${transformedSubmissions.length} submissions from Supabase with anonymous ID`);
        }
      } catch (anonError) {
        console.error('Error fetching submissions with anonymous ID:', anonError)
      }
    }
      
    // Then check cookie storage regardless of Supabase result
    const cookieSubmissions = loadSubmissions();
      
    // Try to match submissions with the userId (which could be UUID or email)
    const userCookieSubmissions = cookieSubmissions.filter(sub => {
      const subUserId = sub.userId || '';
      // Check if it's a direct match or contains the userId string
      return (
        subUserId === userId || 
        subUserId === anonymousId ||
        (typeof subUserId === 'string' && subUserId.includes('@')) || // Email format
        (typeof userId === 'string' && userId.includes('@') && subUserId.includes(userId.split('@')[0])) // Part of email
      );
    });
      
    if (userCookieSubmissions.length > 0) {
      console.log(`Retrieved ${userCookieSubmissions.length} submissions from cookies for user ${userId}`);
        
      // Merge with Supabase results if not already included
      if (result.submissions.length > 0) {
        // Get IDs of submissions we already have
        const existingIds = new Set(result.submissions.map(sub => sub.id));
        
        // Add only cookie submissions that aren't already in the result
        userCookieSubmissions.forEach(sub => {
          if (!existingIds.has(sub.id)) {
            result.submissions.push(sub);
          }
        });
        
        result.source = 'combined';
      } else {
        result.submissions = userCookieSubmissions;
        result.source = 'cookies';
      }
    }
      
    // Sort all submissions by date
    result.submissions.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
}
