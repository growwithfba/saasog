import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/utils/supabaseClient'

export async function POST(request: NextRequest) {
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
    
    // Try to get submissions from Supabase
    try {
      const { data: submissions, error } = await supabase
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
          metrics: sub.metrics || {}
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
