/**
 * Phase 5.4-O — POST /api/submissions/[id]/mark-expansions-read
 *
 * Lightweight UI-state mutation: marks every entry in
 * submission_data.lensExpansions as acknowledged=true. Fired by
 * VettingDetailContent on mount when hasUnacknowledgedExpansion is true,
 * which clears the "+N new" badge on the /vetting dashboard list.
 *
 * Does NOT touch scoreAfter — the detail page banner stays up until the
 * user actually clicks Recalculate. Acknowledged tracks "did the user
 * see this?" while scoreAfter tracks "is this resolved math-wise?".
 *
 * No cap-check: this is purely cosmetic state. Idempotent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const submissionId = params.id;
    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'Submission ID is required' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('id, submission_data')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const submissionData = (submission.submission_data ?? {}) as any;
    const expansions: any[] = Array.isArray(submissionData.lensExpansions)
      ? submissionData.lensExpansions
      : [];

    if (expansions.length === 0 || expansions.every((e) => e?.acknowledged)) {
      // Already in the desired state — return success without a write.
      return NextResponse.json({ success: true, changed: false });
    }

    const acknowledgedExpansions = expansions.map((e) =>
      e?.acknowledged ? e : { ...e, acknowledged: true }
    );

    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        submission_data: {
          ...submissionData,
          lensExpansions: acknowledgedExpansions,
        },
      })
      .eq('id', submissionId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[mark-expansions-read] update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, changed: true });
  } catch (err) {
    console.error('[mark-expansions-read] crashed:', err);
    return NextResponse.json(
      { success: false, error: 'Unexpected error' },
      { status: 500 }
    );
  }
}
