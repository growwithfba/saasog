import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Toggle the public-sharing state of a submission.
// Body: { submissionId: string, shared?: boolean = true }
//   shared === true  => is_public = true, public_shared_at = now()
//   shared === false => is_public = false, public_shared_at = null
export async function POST(request: NextRequest) {
  try {
    const { submissionId, shared = true } = await request.json();

    if (!submissionId) {
      return NextResponse.json({
        success: false,
        error: 'Submission ID is required'
      }, { status: 400 });
    }

    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Create authenticated Supabase client if token exists
    let supabase;
    if (token) {
      supabase = createSupabaseClient(
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
      supabase = createClient();
    }

    const nextIsPublic = Boolean(shared);
    const { data, error } = await supabase
      .from('submissions')
      .update({
        is_public: nextIsPublic,
        public_shared_at: nextIsPublic ? new Date().toISOString() : null
      })
      .eq('id', submissionId)
      .select('id, is_public, public_shared_at')
      .single();

    if (error) {
      console.error('Error toggling submission sharing:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to update sharing status'
      }, { status: 500 });
    }

    const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/submission/${submissionId}`;

    return NextResponse.json({
      success: true,
      shareUrl,
      submission: data
    });
  } catch (error) {
    console.error('Error in share endpoint:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// Get public submission data
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const submissionId = url.searchParams.get('id');
    
    if (!submissionId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Submission ID is required' 
      }, { status: 400 });
    }

    // Use server client for GET requests (no auth needed for public data)
    const supabase = createClient();
    
    // Get the public submission
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('is_public', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ 
        success: false, 
        error: 'Public submission not found' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      submission: data
    });
  } catch (error) {
    console.error('Error fetching public submission:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
