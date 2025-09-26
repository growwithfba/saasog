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

    console.log('API: Downloading CSV for submission ID:', submissionId)

    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('CSV Download: Using authenticated client with JWT token');
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
      console.log('CSV Download: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Try to get the authenticated user
    const { data: authData } = await serverSupabase.auth.getUser()
    const currentUserId = authData.user?.id

    // Fetch the submission from Supabase
    const { data: submission, error } = await serverSupabase
      .from('submissions')
      .select('original_csv_data, user_id, is_public, title, product_name')
      .eq('id', submissionId)
      .single()

    if (error || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Check if the user has access to this submission
    if (currentUserId && submission.user_id !== currentUserId) {
      // Check if the submission is public
      if (!submission.is_public) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // Check if original CSV data exists
    if (!submission.original_csv_data) {
      return NextResponse.json(
        { success: false, error: 'Original CSV data not available for this submission' },
        { status: 404 }
      )
    }

    const csvData = submission.original_csv_data
    let content = csvData.content
    let fileName = csvData.fileName || `${submission.title || submission.product_name || 'analysis'}.csv`

    // Handle multiple files case
    if (csvData.files && csvData.files.length > 1) {
      // For multiple files, return the combined content
      fileName = `${submission.title || submission.product_name || 'analysis'}_combined.csv`
    }

    // Return the CSV file as a download
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('Error downloading CSV:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to download CSV' },
      { status: 500 }
    )
  }
}
