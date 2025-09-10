import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Make submission publicly accessible by ID
export async function POST(request: NextRequest) {
  try {
    const { submissionId } = await request.json();
    
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
      console.log('Share: Using authenticated client with JWT token');
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
      console.log('Share: No token found, using server client with cookies');
      supabase = createClient();
    }

    // Update the submission to be publicly accessible
    const { data, error } = await supabase
      .from('submissions')
      .update({ 
        is_public: true,
        public_shared_at: new Date().toISOString()
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      console.error('Error making submission public:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to make submission public' 
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
