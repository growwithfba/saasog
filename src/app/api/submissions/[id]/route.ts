import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/utils/supabaseAdmin';
import { checkCap } from '@/lib/subscription';

// PATCH /api/submissions/[id]
// Body A — apply an adjustment (competitor removal + recalc):
//   {
//     action: 'adjust',
//     removedAsins: string[],
//     competitors: Competitor[],           // the filtered list (already excludes removed)
//     distributions?: object,
//     keepaResults?: any[],
//     marketScore: { score: number, status: string },
//     metrics?: object,
//   }
//
// Body B — reset to original:
//   { action: 'reset' }
//
// Invariants:
// - First 'adjust' snapshots current canonical state into submission_data.originalSnapshot.
// - Subsequent 'adjust' calls preserve originalSnapshot untouched.
// - 'reset' restores canonical from originalSnapshot and clears submission_data.adjustment.
//   originalSnapshot is preserved so the user can re-adjust without losing the original baseline.
export async function PATCH(
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

    const body = await request.json();
    const action = body?.action;
    if (action !== 'adjust' && action !== 'reset') {
      return NextResponse.json(
        { success: false, error: "action must be 'adjust' or 'reset'" },
        { status: 400 }
      );
    }

    // Authenticate — require a bearer token so we can confirm ownership.
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

    // Load the current submission so we can read existing submission_data.
    const { data: current, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const existingData = current.submission_data || {};
    const existingSnapshot = existingData.originalSnapshot || null;
    const now = new Date().toISOString();

    if (action === 'reset') {
      if (!existingSnapshot) {
        return NextResponse.json(
          { success: false, error: 'No adjustment to reset — originalSnapshot is missing' },
          { status: 400 }
        );
      }

      const { adjustment: _discard, ...restData } = existingData;
      const restoredSubmissionData = {
        ...restData,
        productData: existingSnapshot.productData ?? existingData.productData ?? {},
        keepaResults: existingSnapshot.keepaResults ?? existingData.keepaResults ?? [],
        marketScore: existingSnapshot.marketScore ?? existingData.marketScore ?? {},
        metrics: existingSnapshot.metrics ?? existingData.metrics ?? {},
        updatedAt: now,
        // originalSnapshot is intentionally preserved for future re-adjust cycles.
        originalSnapshot: existingSnapshot,
      };

      // Phase 5.4-J — restore the original ai_summary if it was snapshotted
      // on the first adjust. Lets the user return to the original briefing
      // without spending a Claude call on regeneration.
      const updateColumns: Record<string, any> = {
        score: existingSnapshot.score ?? current.score,
        status: existingSnapshot.status ?? current.status,
        metrics: existingSnapshot.metrics ?? current.metrics,
        submission_data: restoredSubmissionData,
      };
      if (Object.prototype.hasOwnProperty.call(existingSnapshot, 'aiSummary')) {
        updateColumns.ai_summary = existingSnapshot.aiSummary ?? null;
      }

      const { data: updated, error: updateError } = await supabase
        .from('submissions')
        .update(updateColumns)
        .eq('id', submissionId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError) {
        console.error('Reset update error:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to reset submission' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, submission: updated });
    }

    // action === 'adjust'
    const { removedAsins, competitors, distributions, keepaResults, marketScore, metrics } = body;

    if (!Array.isArray(removedAsins) || !Array.isArray(competitors) || !marketScore) {
      return NextResponse.json(
        { success: false, error: 'adjust requires removedAsins[], competitors[], and marketScore' },
        { status: 400 }
      );
    }

    // Phase 5.4-O — adjust runs the same Keepa + scoring + AI-summary
    // pipeline as a fresh vetting (counted via the usage_events insert
    // below). Cap-check before doing the work; 402 surfaces the cap-modal
    // payload so the UI can render the upgrade prompt without a follow-up
    // call. Symmetrical with /api/submissions/[id]/lens-recalc — both
    // paths consume a vetting slot and share the same gating.
    const adjustCap = await checkCap(supabase, userId, 'vetting');
    if (!adjustCap.allowed) {
      console.log('PATCH adjust: vetting cap reached', {
        userId,
        used: adjustCap.used,
        limit: adjustCap.limit,
        tier: adjustCap.state.effectiveTier,
      });
      return NextResponse.json(
        {
          success: false,
          error: `You've used all ${adjustCap.limit} vettings on the Core plan this period. Upgrade to Pro for unlimited vettings.`,
          cap: {
            action: 'vetting',
            used: adjustCap.used,
            limit: adjustCap.limit,
            remaining: adjustCap.remaining,
            tier: adjustCap.state.tier,
            effectiveTier: adjustCap.state.effectiveTier,
          },
        },
        { status: 402 }
      );
    }

    // Snapshot the current canonical state ONLY on the first adjustment.
    // Phase 5.4-J — also stash the current ai_summary so a later reset can
    // restore the original briefing without a Claude call.
    const snapshot =
      existingSnapshot ??
      {
        productData: existingData.productData ?? {},
        keepaResults: existingData.keepaResults ?? [],
        marketScore: existingData.marketScore ?? {},
        metrics: existingData.metrics ?? current.metrics ?? {},
        score: current.score,
        status: current.status,
        aiSummary: current.ai_summary ?? null,
        snapshotAt: now,
      };

    const nextSubmissionData = {
      ...existingData,
      productData: {
        competitors,
        distributions: distributions ?? existingData.productData?.distributions ?? {},
      },
      keepaResults: keepaResults ?? existingData.keepaResults ?? [],
      marketScore,
      metrics: metrics ?? existingData.metrics ?? {},
      updatedAt: now,
      originalSnapshot: snapshot,
      adjustment: {
        removedAsins,
        adjustedScore: marketScore.score,
        adjustedAt: now,
      },
    };

    const { data: updated, error: updateError } = await supabase
      .from('submissions')
      .update({
        score: marketScore.score,
        status: marketScore.status,
        metrics: metrics ?? current.metrics,
        submission_data: nextSubmissionData,
      })
      .eq('id', submissionId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Adjust update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update submission' },
        { status: 500 }
      );
    }

    // Phase 5.4-O — record the recalc against the user's vetting cap.
    // Best-effort; the adjust itself already succeeded.
    void supabaseAdmin.from('usage_events').insert({
      user_id: userId,
      provider: 'other',
      operation: 'vetting_recalc',
      status: 'ok',
      metadata: {
        submissionId,
        path: 'patch-adjust',
        removedAsins,
        adjustedScore: marketScore?.score ?? null,
        ts: now,
      },
    });

    return NextResponse.json({ success: true, submission: updated });
  } catch (error) {
    console.error('PATCH submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
