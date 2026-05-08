/**
 * Phase 5.4-O — POST /api/submissions/[id]/undo-expansion
 *
 * Removes a single Lens-driven expansion batch and restores the
 * submission to its pre-this-batch state. Earlier and later
 * expansions are preserved untouched — each entry's
 * preExpansionSnapshot was captured at the moment that specific
 * batch landed, so restoring it returns to the state immediately
 * before that batch (and only that batch).
 *
 * Body: { expansionId: string }   // matches lensExpansions[].id
 *
 * Auth: bearer token, RLS-scoped (owner-only).
 *
 * Behavior:
 *   1. Resolve user from bearer token.
 *   2. Load submission. Find the expansion entry by id.
 *   3. Restore productData.competitors / marketScore / metrics /
 *      keepaResults / ai_summary from preExpansionSnapshot.
 *   4. Remove that entry from lensExpansions[].
 *   5. Persist + return updated submission.
 *
 * Note: this does NOT touch submission_data.adjustment or
 * originalSnapshot — Adjustments and Expansions are independent
 * concepts (per Phase 5.4-O memory rule #15). If the user has both
 * an adjustment AND expansions, undoing one expansion preserves
 * the adjustment.
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

    const body = await request.json().catch(() => ({}));
    const expansionId = typeof body?.expansionId === 'string' ? body.expansionId : '';
    if (!expansionId) {
      return NextResponse.json(
        { success: false, error: 'expansionId is required' },
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
      .select('*')
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
    const target = expansions.find((e) => e?.id === expansionId);
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Expansion not found' },
        { status: 404 }
      );
    }

    const snapshot = target?.preExpansionSnapshot ?? null;
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Expansion has no snapshot to restore' },
        { status: 400 }
      );
    }

    const remainingExpansions = expansions.filter((e) => e?.id !== expansionId);

    const restoredSubmissionData = {
      ...submissionData,
      productData: snapshot.productData ?? submissionData.productData ?? {},
      keepaResults: snapshot.keepaResults ?? submissionData.keepaResults ?? [],
      marketScore: snapshot.marketScore ?? submissionData.marketScore ?? {},
      metrics: snapshot.metrics ?? submissionData.metrics ?? {},
      lensExpansions: remainingExpansions,
      // No remaining unresolved expansions → also clear the legacy flag.
      __lens_pending_recalc: remainingExpansions.some((e) => e?.scoreAfter == null),
      updatedAt: new Date().toISOString(),
    };

    const updateColumns: Record<string, any> = {
      score: typeof snapshot.score === 'number' ? snapshot.score : submission.score,
      status: typeof snapshot.status === 'string' ? snapshot.status : submission.status,
      metrics: snapshot.metrics ?? submission.metrics,
      submission_data: restoredSubmissionData,
    };
    if (Object.prototype.hasOwnProperty.call(snapshot, 'aiSummary')) {
      updateColumns.ai_summary = snapshot.aiSummary ?? null;
    }

    const { data: updated, error: updateError } = await supabase
      .from('submissions')
      .update(updateColumns)
      .eq('id', submissionId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[undo-expansion] update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to undo expansion' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, submission: updated });
  } catch (err) {
    console.error('[undo-expansion] crashed:', err);
    return NextResponse.json(
      { success: false, error: 'Unexpected error' },
      { status: 500 }
    );
  }
}
