import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

// Submit a validation request
export async function POST(request: NextRequest) {
  try {
    const { userId, submissionId, submissionUrl } = await request.json();
    
    if (!userId || !submissionId) {
      return NextResponse.json({ 
        success: false, 
        error: 'User ID and Submission ID are required' 
      }, { status: 400 });
    }

    // Check how many validations this user has submitted
    const { data: existingValidations, error: countError } = await supabase
      .from('validation_submissions')
      .select('id')
      .eq('user_id', userId);

    if (countError) {
      console.error('Error checking validation count:', countError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check validation limit' 
      }, { status: 500 });
    }

    if (existingValidations && existingValidations.length >= 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'You have reached the maximum of 2 validation submissions' 
      }, { status: 403 });
    }

    // Create the validation submission record
    const { data, error } = await supabase
      .from('validation_submissions')
      .insert({
        user_id: userId,
        submission_id: submissionId,
        submission_url: submissionUrl,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating validation submission:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to submit validation request' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      validation: data,
      remaining: 2 - (existingValidations?.length || 0) - 1
    });
  } catch (error) {
    console.error('Error in validation submission:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Get user's validation submissions
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

    const { data, error } = await supabase
      .from('validation_submissions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching validations:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch validations' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      validations: data || [],
      remaining: Math.max(0, 2 - (data?.length || 0))
    });
  } catch (error) {
    console.error('Error fetching validations:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
