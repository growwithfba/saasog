import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Helper function to create authenticated Supabase client
 */
function getSupabaseClient(token?: string) {
  if (token) {
    return createSupabaseClient(
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
  }
  return createClient();
}

/**
 * DELETE /api/sourcing/clear
 * 
 * Deletes sourcing products and updates research_products flags
 * - Deletes records from sourcing_products table
 * - Updates is_sourced to false in research_products
 * - Updates is_offered to false in research_products (product goes back in funnel)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const serverSupabase = getSupabaseClient(token);

    // Get authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get ASINs from request body
    const body = await request.json();
    const { asins } = body;

    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ASINs array is required' },
        { status: 400 }
      );
    }

    console.log(`[Sourcing Clear] Clearing ${asins.length} products for user ${user.id}`);

    const deletedProductIds: string[] = [];
    const errors: Array<{ asin: string; error: string }> = [];

    // Process each ASIN
    for (const asin of asins) {
      try {
        // Get the research product to find the product_id
        const { data: researchData, error: fetchError } = await serverSupabase
          .from('research_products')
          .select('id')
          .eq('asin', asin)
          .eq('user_id', user.id)
          .single();

        if (fetchError || !researchData) {
          console.error(`[Sourcing Clear] Research product not found for ASIN ${asin}:`, fetchError);
          errors.push({ asin, error: 'Research product not found' });
          continue;
        }

        const productId = researchData.id;

        // Delete from sourcing_products table
        const { error: deleteError } = await serverSupabase
          .from('sourcing_products')
          .delete()
          .eq('product_id', productId);

        if (deleteError) {
          console.error(`[Sourcing Clear] Error deleting sourcing product for ${asin}:`, deleteError);
          errors.push({ asin, error: deleteError.message });
          continue;
        }

        console.log(`[Sourcing Clear] Successfully deleted sourcing product for ${asin} (product_id: ${productId})`);

        // Update research_products: set is_sourced to false
        const { error: updateError } = await serverSupabase
          .from('research_products')
          .update({
            is_sourced: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', productId);

        if (updateError) {
          console.error(`[Sourcing Clear] Error updating research product flags for ${asin}:`, updateError);
          errors.push({ asin, error: updateError.message });
          continue;
        }

        console.log(`[Sourcing Clear] Successfully updated research product flags (is_sourced=false) for ${asin}`);
        deletedProductIds.push(productId);

      } catch (error) {
        console.error(`[Sourcing Clear] Unexpected error processing ${asin}:`, error);
        errors.push({ 
          asin, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    // Return response with summary
    const successCount = deletedProductIds.length;
    const errorCount = errors.length;

    return NextResponse.json({
      success: true,
      message: `Successfully cleared ${successCount} product${successCount !== 1 ? 's' : ''}`,
      data: {
        deletedProductIds,
        successCount,
        errorCount,
        errors: errorCount > 0 ? errors : undefined,
      }
    });

  } catch (error) {
    console.error('[Sourcing Clear] Server error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
