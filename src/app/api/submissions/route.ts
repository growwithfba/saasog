import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * DELETE /api/submissions
 * Bulk-delete submissions with cascade:
 *   1. Look up research_products_id for each submission (scoped to the user).
 *   2. Delete offer_products whose product_id matches those research_products_ids.
 *   3. Flip research_products.is_vetted and is_offered to false for those ids.
 *   4. Delete the submissions rows.
 *
 * Body: { submissionIds: string[] }
 * Returns: { success, deletedSubmissions, deletedOffers, updatedResearchProducts }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const submissionIds: unknown = body?.submissionIds;

    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain a non-empty "submissionIds" array' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    const serverSupabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
      : createClient();

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Admin client for cascade deletes — scoped to the verified user_id at every step.
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 1: fetch the submissions (ownership-filtered) to pull research_products_id.
    const { data: submissionRows, error: fetchError } = await adminSupabase
      .from('submissions')
      .select('id, research_products_id')
      .in('id', submissionIds)
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('DELETE /api/submissions: failed to fetch submissions:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + fetchError.message },
        { status: 500 }
      );
    }

    if (!submissionRows || submissionRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No matching submissions found for this user' },
        { status: 404 }
      );
    }

    const researchProductIds = Array.from(
      new Set(
        submissionRows
          .map(row => row.research_products_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const ownedSubmissionIds = submissionRows.map(row => row.id);

    // Step 2: delete offer_products for those research_products_ids.
    let deletedOffers = 0;
    if (researchProductIds.length > 0) {
      const { data: deletedOfferRows, error: offerDeleteError } = await adminSupabase
        .from('offer_products')
        .delete()
        .in('product_id', researchProductIds)
        .select('id');

      if (offerDeleteError) {
        console.error('DELETE /api/submissions: failed to cascade offer_products:', offerDeleteError);
        return NextResponse.json(
          { success: false, error: 'Failed to clear offering data: ' + offerDeleteError.message },
          { status: 500 }
        );
      }
      deletedOffers = deletedOfferRows?.length ?? 0;
    }

    // Step 3: flip is_vetted + is_offered to false on research_products.
    let updatedResearchProducts = 0;
    if (researchProductIds.length > 0) {
      const { data: updatedRows, error: statusError } = await adminSupabase
        .from('research_products')
        .update({
          is_vetted: false,
          is_offered: false,
          updated_at: new Date().toISOString(),
        })
        .in('id', researchProductIds)
        .eq('user_id', user.id)
        .select('id');

      if (statusError) {
        console.error('DELETE /api/submissions: failed to update research_products flags:', statusError);
        return NextResponse.json(
          { success: false, error: 'Failed to update research flags: ' + statusError.message },
          { status: 500 }
        );
      }
      updatedResearchProducts = updatedRows?.length ?? 0;
    }

    // Step 4: delete the submissions rows.
    const { data: deletedSubmissionRows, error: deleteError } = await adminSupabase
      .from('submissions')
      .delete()
      .in('id', ownedSubmissionIds)
      .eq('user_id', user.id)
      .select('id');

    if (deleteError) {
      console.error('DELETE /api/submissions: failed to delete submissions:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete submissions: ' + deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedSubmissions: deletedSubmissionRows?.length ?? 0,
      deletedOffers,
      updatedResearchProducts,
    });
  } catch (error) {
    console.error('DELETE /api/submissions: unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete submissions',
      },
      { status: 500 }
    );
  }
}
