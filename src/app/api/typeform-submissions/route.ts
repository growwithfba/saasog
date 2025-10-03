import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Get user's typeform submission status
export async function GET(request: NextRequest) {
  try {
    // Check for Authorization header first
    const authHeader = request.headers.get('Authorization');
    let supabase;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      console.log('GET typeform: Using token authentication');
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
      console.log('GET typeform: Using server client with cookies');
      supabase = createClient();
    }
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.warn('GET typeform: No authenticated user, returning default state');
      // Return default optimistic state for unauthenticated users
      return NextResponse.json({ 
        success: true,
        canSubmit: true,
        submissionsUsed: 0,
        submissionsRemaining: 2,
        weekResetsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    }

    // Check typeform submission status using our database function
    const { data, error } = await supabase
      .rpc('check_and_update_typeform_submissions', { 
        user_id: user.id 
      });

    if (error) {
      console.error('Error checking typeform submissions:', error);
      // If the function doesn't exist (migration not run), return default optimistic state
      if (error.code === '42883') { // function does not exist
        return NextResponse.json({ 
          success: true,
          canSubmit: true,
          submissionsUsed: 0,
          submissionsRemaining: 2,
          weekResetsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });
      }
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check submission status' 
      }, { status: 500 });
    }

    // The function returns an array with one row
    const status = data && data.length > 0 ? data[0] : {
      can_submit: true, // Default to allowing submissions
      submissions_used: 0,
      submissions_remaining: 2,
      week_resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    return NextResponse.json({ 
      success: true,
      canSubmit: status.can_submit,
      submissionsUsed: status.submissions_used,
      submissionsRemaining: status.submissions_remaining,
      weekResetsAt: status.week_resets_at
    });
  } catch (error) {
    console.error('Error in typeform submissions GET:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Record a new typeform submission
export async function POST(request: NextRequest) {
  try {
    // Check for Authorization header first
    const authHeader = request.headers.get('Authorization');
    let supabase;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      console.log('POST typeform: Using token authentication');
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
      console.log('POST typeform: Using server client with cookies');
      supabase = createClient();
    }
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.warn('POST typeform: No authenticated user, allowing submission without tracking');
      // For now, allow submission without tracking if user isn't authenticated
      // This ensures the core functionality works
      return NextResponse.json({ 
        success: true,
        submissionsUsed: 0,
        submissionsRemaining: 2,
        message: 'Typeform submission allowed (no tracking - not authenticated).'
      });
    }

    console.log('Typeform POST: User authenticated:', user.id);

    const { submissionId } = await request.json();
    
    if (!submissionId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Submission ID is required' 
      }, { status: 400 });
    }

    console.log('Typeform POST: Recording typeform click for submission:', submissionId);

    // First check if user can submit
    const { data: statusData, error: statusError } = await supabase
      .rpc('check_and_update_typeform_submissions', { 
        user_id: user.id 
      });

    console.log('Typeform POST: Status check result:', { statusData, statusError });

    if (statusError) {
      console.error('Error checking typeform status:', statusError);
      // If the function doesn't exist (migration not run), allow submission
      if (statusError.code === '42883') { // function does not exist
        console.warn('Typeform tracking function not found, allowing submission');
        // Continue with submission but don't increment counter
      } else {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to check submission eligibility' 
        }, { status: 500 });
      }
    }

    const status = statusData && statusData.length > 0 ? statusData[0] : null;
    let incrementData = null;
    
    // If functions don't exist (migration not run), skip limit checking
    if (statusError && statusError.code === '42883') {
      // Functions don't exist, allow submission without tracking
      console.log('Typeform tracking not available, allowing submission');
    } else {
      // Normal limit checking
      if (!status || !status.can_submit) {
        const weekResetsAt = status?.week_resets_at || new Date();
        return NextResponse.json({ 
          success: false, 
          error: 'Weekly submission limit reached',
          submissionsUsed: status?.submissions_used || 2,
          submissionsRemaining: 0,
          weekResetsAt: weekResetsAt
        }, { status: 403 });
      }

      // Increment the submission count
      const { data: incrementResult, error: incrementError } = await supabase
        .rpc('increment_typeform_submissions', { 
          user_id: user.id 
        });

      if (incrementError) {
        console.error('Error incrementing typeform submissions:', incrementError);
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to record submission' 
        }, { status: 500 });
      }

      incrementData = incrementResult;
      const result = incrementData && incrementData.length > 0 ? incrementData[0] : null;
      
      if (!result || !result.success) {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to record submission - limit may have been reached' 
        }, { status: 403 });
      }
    }

    // Optionally create a record in validation_submissions for backward compatibility
    // Create a simple record to track the typeform click
    try {
      const { error: validationError } = await supabase
        .from('validation_submissions')
        .insert({
          user_id: user.id,
          submission_id: submissionId,
          submission_url: 'https://form.typeform.com/to/WQWZXnEy',
          status: 'pending',
          notes: 'Typeform click tracked',
          created_at: new Date().toISOString()
        });

      // Don't fail the request if validation_submissions insert fails
      // as the main typeform tracking is already recorded
      if (validationError) {
        console.warn('Failed to create validation_submissions record:', validationError);
      }
    } catch (validationInsertError) {
      console.warn('Error inserting validation record:', validationInsertError);
      // Continue anyway - this is just for backward compatibility
    }

    // Return appropriate response based on whether tracking is available
    if (statusError && statusError.code === '42883') {
      console.log('Typeform POST: Returning success without tracking');
      return NextResponse.json({ 
        success: true,
        submissionsUsed: 0,
        submissionsRemaining: 2,
        message: 'Typeform submission recorded (tracking not available).'
      });
    } else {
      const result = incrementData && incrementData.length > 0 ? incrementData[0] : null;
      console.log('Typeform POST: Returning success with tracking:', { result });
      return NextResponse.json({ 
        success: true,
        submissionsUsed: result?.new_count || 1,
        submissionsRemaining: result?.submissions_remaining || 1,
        message: `Typeform submission recorded. You have ${result?.submissions_remaining || 1} submissions remaining this week.`
      });
    }
  } catch (error) {
    console.error('Error in typeform submissions POST:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
