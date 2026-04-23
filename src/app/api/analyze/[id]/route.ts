import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const submissionId = params.id
    
    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'Submission ID is required' },
        { status: 400 }
      )
    }

    console.log('API: Fetching submission with ID:', submissionId)

    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('Individual submission: Using authenticated client with JWT token');
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
      console.log('Individual submission: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Try to get the authenticated user
    const { data: authData } = await serverSupabase.auth.getUser()
    const currentUserId = authData.user?.id

    // Try to fetch from Supabase first
    try {
      const { data: submission, error } = await serverSupabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single()

      if (!error && submission) {
        // If the viewer is NOT the owner, require is_public = true. RLS
        // already blocks the select above for non-owners when is_public
        // is false, but this is a belt-and-suspenders check.
        const isOwner = currentUserId && submission.user_id === currentUserId;
        if (!isOwner && !submission.is_public) {
          return NextResponse.json(
            { success: false, error: 'Submission not found' },
            { status: 404 }
          );
        }

        // Look up the owner's display name so the public view can show
        // "Shared by ...". Uses profiles (publicly SELECT-able) — fallback
        // to "Anonymous" if the row is missing a name.
        let ownerDisplayName: string | null = null;
        if (submission.user_id) {
          const { data: profile } = await serverSupabase
            .from('profiles')
            .select('full_name, username')
            .eq('id', submission.user_id)
            .maybeSingle();
          ownerDisplayName = profile?.full_name || profile?.username || null;
        }

        // Transform Supabase data to match expected format
        const transformedSubmission = {
          id: submission.id,
          userId: submission.user_id,
          title: submission.title,
          score: submission.score,
          status: submission.status,
          productName: submission.product_name,
          createdAt: submission.created_at,
          productData: submission.submission_data?.productData || {},
          keepaResults: submission.submission_data?.keepaResults || [],
          marketScore: submission.submission_data?.marketScore || {},
          metrics: submission.metrics || {},
          originalCsvData: submission.original_csv_data || null,
          isPublic: Boolean(submission.is_public),
          publicSharedAt: submission.public_shared_at || null,
          aiSummary: submission.ai_summary || null,
          adjustment: submission.submission_data?.adjustment || null,
          originalSnapshot: submission.submission_data?.originalSnapshot || null,
          ownerDisplayName
        }

        console.log('Successfully fetched submission from Supabase:', submissionId)
        return NextResponse.json({
          success: true,
          submission: transformedSubmission,
          source: 'supabase'
        })
      }
    } catch (supabaseError) {
      console.error('Supabase error fetching submission:', supabaseError)
    }

    // If not found in Supabase, try localStorage/cookies fallback
    // This is for backwards compatibility with existing data
    console.log('Submission not found in Supabase, checking local storage...')
    
    return NextResponse.json(
      { success: false, error: 'Submission not found', submissionId },
      { status: 404 }
    )

  } catch (error) {
    console.error('Error fetching submission:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submission' },
      { status: 500 }
    )
  }
}