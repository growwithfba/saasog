/**
 * Phase 2.3 — POST /api/vetting/generate-summary
 *
 * Body: { submissionId: string, force?: boolean }
 *
 * Flow:
 *   1. Authenticate, verify the caller owns the submission.
 *   2. If ai_summary already exists and !force → return cached.
 *   3. Derive a compact metrics object from submission_data via
 *      deriveSummaryMetrics (shared with /api/submissions/[id]/lens-recalc
 *      so the AI briefing is consistent across initial vetting and
 *      Phase 5.4-O Lens-expansion recalcs).
 *   4. Call generateVettingSummary (Sonnet 4.6 via runAnthropic).
 *   5. Persist to submissions.ai_summary. Return the summary.
 *
 * Public viewers DO NOT hit this route. The public share page reads
 * ai_summary from /api/analyze/[id] and falls through to the legacy
 * mad-libs string if it's null. Generation is owner-triggered only —
 * keeps token spend bounded and removes the unauth'd-spend attack
 * surface.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabaseServer';
import { generateVettingSummary } from '@/services/vettingSummary';
import { deriveSummaryMetrics } from '@/lib/vetting/deriveSummaryMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const submissionId: string | undefined = body?.submissionId;
    const force: boolean = Boolean(body?.force);

    if (!submissionId) {
      return NextResponse.json(
        { success: false, error: 'submissionId is required' },
        { status: 400 }
      );
    }

    // --- Auth: build a Supabase client scoped to the caller's JWT ---
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supa = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supa.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // --- Load the submission. RLS will reject non-owners. ---
    const { data: submission, error: fetchError } = await supa
      .from('submissions')
      .select('id, user_id, score, status, submission_data, ai_summary')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    if (submission.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Serve cached unless force=true.
    if (!force && submission.ai_summary) {
      return NextResponse.json({ success: true, summary: submission.ai_summary, cached: true });
    }

    // --- Derive metrics from submission_data ---
    const metrics = deriveSummaryMetrics(submission);

    // --- Call Anthropic ---
    const summary = await generateVettingSummary({
      metrics,
      userId: user.id,
      submissionId,
    });

    // --- Persist ---
    const { error: updateError } = await supa
      .from('submissions')
      .update({ ai_summary: summary })
      .eq('id', submissionId)
      .eq('user_id', user.id);

    if (updateError) {
      // Generation succeeded but persistence failed — return the summary
      // anyway so the UI doesn't degrade; log the persistence miss so we
      // can chase it in usage_events / logs.
      console.error('[vetting/generate-summary] update failed:', updateError);
    }

    return NextResponse.json({ success: true, summary, cached: false });
  } catch (err) {
    console.error('[vetting/generate-summary] failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to generate summary',
      },
      { status: 500 }
    );
  }
}

