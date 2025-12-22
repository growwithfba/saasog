import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { userId, title, score, status, productData, keepaResults, marketScore, productName, originalCsvData } = data

    console.log('API: Processing submission for user ID:', userId);
    console.log('API: Submission data summary:', { 
      title, 
      productName, 
      score, 
      status, 
      hasProductData: !!productData,
      hasKeepaResults: !!keepaResults && keepaResults.length > 0,
      hasOriginalCsvData: !!originalCsvData
    });

    // Server-side validation: Check if data exceeds reasonable limits (5 CSV files worth)
    if (productData?.competitors && productData.competitors.length > 1000) {
      console.error('API: Too many competitors - possible file limit violation');
      return NextResponse.json({ 
        success: false, 
        error: 'Too many competitors in submission. Maximum 5 CSV files allowed.' 
      }, { status: 422 });
    }

    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let dbClient;
    if (token) {
      console.log('Using authenticated client with JWT token');
      dbClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );
    } else {
      console.log('No token found, using server client with cookies');
      dbClient = createClient();
    }
    
    // Use the provided userId directly
    let actualUserId = userId;
    console.log('Using provided user ID:', actualUserId);
    
    // Log Supabase connection check
    const connectionCheck = await dbClient.from('submissions').select('count');
    console.log('API: Supabase connection check:', { 
      success: !connectionCheck.error,
      error: connectionCheck.error
    });

    console.log('API: Attempting to save to Supabase with user ID:', actualUserId);
    
    // Check for recent duplicate submissions to prevent double-saves
    // Look for submissions with same user, title, and similar timestamp (within 30 seconds)
    const recentTimeThreshold = new Date(Date.now() - 30000).toISOString(); // 30 seconds ago
    const { data: recentSubmissions, error: checkError } = await dbClient
      .from('submissions')
      .select('id, title, product_name, created_at')
      .eq('user_id', actualUserId)
      .gte('created_at', recentTimeThreshold)
      .order('created_at', { ascending: false });
    
    if (!checkError && recentSubmissions && recentSubmissions.length > 0) {
      const submissionTitle = title || productName || 'Untitled Analysis';
      const duplicateSubmission = recentSubmissions.find(sub => 
        (sub.title === submissionTitle || sub.product_name === submissionTitle)
      );
      
      if (duplicateSubmission) {
        console.log('API: Duplicate submission detected, returning existing submission:', duplicateSubmission.id);
        return NextResponse.json({ 
          success: true, 
          id: duplicateSubmission.id,
          message: 'Duplicate submission prevented - returning existing submission',
          duplicate: true
        }, { status: 200 });
      }
    }
    
    // Prepare submission data
    const submissionPayload = {
      user_id: actualUserId,
      title: title || productName || 'Untitled Analysis',
      product_name: productName || title || 'Untitled Product',
      score: score,
      status: status,
      submission_data: {
        productData,
        keepaResults: keepaResults || [],
        marketScore,
        createdAt: new Date().toISOString()
      },
      original_csv_data: originalCsvData, // Store original CSV data
      metrics: {
        totalCompetitors: productData?.competitors?.length || 0,
        totalMarketCap: productData?.competitors?.reduce((sum: number, comp: any) => sum + (comp.monthlyRevenue || 0), 0) || 0,
        revenuePerCompetitor: productData?.competitors?.length > 0 
          ? (productData.competitors.reduce((sum: number, comp: any) => sum + (comp.monthlyRevenue || 0), 0) / productData.competitors.length)
          : 0
      }
    };
    
    console.log('API: Supabase insert data structure:', {
      user_id: submissionPayload.user_id,
      title: submissionPayload.title,
      product_name: submissionPayload.product_name,
      competitors_count: submissionPayload.metrics.totalCompetitors
    });
    
    // Try to insert into Supabase using server client
    // Use the server client which has proper cookie access
    const { data: supabaseData, error } = await dbClient
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
      id: savedSubmission.id,
      message: 'Submission saved successfully to database'
    }, { status: 201 })
  } catch (error) {
    console.error('Error saving submission:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save submission: ' + error.message },
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
    
    console.log('API GET: Fetching submissions for user:', userId);
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('GET: Using authenticated client with JWT token');
      serverSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );
    } else {
      console.log('GET: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Try to get submissions from Supabase
    try {
      const { data: submissions, error } = await serverSupabase
        .from('submissions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error fetching submissions:', error);
        throw error;
      }

      if (submissions && submissions.length > 0) {
        // Transform Supabase data to match the expected format
        const transformedSubmissions = submissions.map(sub => ({
          id: sub.id,
          userId: sub.user_id,
          title: sub.title,
          score: sub.score,
          status: sub.status,
          productName: sub.product_name,
          createdAt: sub.created_at,
          productData: sub.submission_data?.productData || {},
          keepaResults: sub.submission_data?.keepaResults || [],
          marketScore: sub.submission_data?.marketScore || {},
          metrics: sub.metrics || {},
          research_product_id: sub.research_products_id || null
        }))
        
        console.log(`Retrieved ${transformedSubmissions.length} submissions from Supabase`);
        return NextResponse.json({
          success: true,
          submissions: transformedSubmissions,
          source: 'supabase'
        });
      } else {
        console.log('No submissions found in Supabase for user:', userId);
        return NextResponse.json({
          success: true,
          submissions: [],
          source: 'supabase'
        });
      }
    } catch (supabaseError) {
      console.error('Supabase error:', supabaseError)
      
      return NextResponse.json({
        success: false,
        error: 'Database error: ' + supabaseError.message
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
}
