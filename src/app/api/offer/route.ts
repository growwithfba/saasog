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
 * GET /api/offer?productId=xxx OR /api/offer?asin=xxx
 * 
 * Retrieves product information from offer_products based on the product_id
 * stored in offer_products table.
 * 
 * Query Parameters:
 * - productId: string (optional) - The product_id from offer_products table
 * - asin: string (optional) - The ASIN to look up in research_products first
 * 
 * If asin is provided, the API will:
 * 1. Query research_products by ASIN to get the product ID
 * 2. Use that ID to query offer_products
 * 3. Query submissions by research_products_id
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     offerProduct: {...},      // Data from offer_products
 *     researchProduct: {...},   // Data from research_products (when queried by asin)
 *     submission: {...},        // Data from submissions (may be null)
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const serverSupabase = getSupabaseClient(token);

    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get productId or asin from query params
    const { searchParams } = new URL(request.url);
    let productId = searchParams.get('productId');
    const asin = searchParams.get('asin');

    let researchProduct: any = null;

    // If asin is provided, look up research_products first
    if (asin && !productId) {
      console.log(`GET /api/offer: Looking up research_products for asin: ${asin}`);
      
      const { data: researchData, error: researchError } = await serverSupabase
        .from('research_products')
        .select('*')
        .eq('asin', asin)
        .eq('user_id', user.id)
        .single();

      if (researchError) {
        if (researchError.code === 'PGRST116') {
          return NextResponse.json({
            success: true,
            data: {
              offerProduct: null,
              researchProduct: null,
            },
            message: 'No research product found with this ASIN'
          });
        }
        
        console.error('Error fetching research product by ASIN:', researchError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch research product: ' + researchError.message },
          { status: 500 }
        );
      }

      researchProduct = researchData;
      productId = researchData.id;
      console.log(`GET /api/offer: Found research product ID: ${productId} for ASIN: ${asin}`);
    }

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID or ASIN provided' },
        { status: 400 }
      );
    }
    // Fetch the submission record associated with this product
    const { data: submission, error: submissionError } = await serverSupabase
      .from('submissions')
      .select('*')
      .eq('research_products_id', productId)
      .maybeSingle();

    if (submissionError) {
      console.error('Error fetching submission:', submissionError);
      // Don't fail the entire request if submission fetch fails
      // Just log and continue with null submission
    }

    console.log(`GET /api/offer: Fetching product info for productId: ${productId}`);

    // Fetch the offer_products record
    const { data: offerProduct, error: offerError } = await serverSupabase
      .from('offer_products')
      .select('*')
      .eq('product_id', productId)
      .single();

    if (offerError) {
      // If no record found in offer_products
      if (offerError.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          data: {
            offerProduct: null,
            researchProduct: researchProduct,
            submission: submission,
          },
          message: 'No offer product found with this ID'
        });
      }
      
      console.error('Error fetching offer product:', offerError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch offer product: ' + offerError.message },
        { status: 500 }
      );
    }

    console.log(`GET /api/offer: Successfully fetched product info`);

    return NextResponse.json({
      success: true,
      data: {
        offerProduct: offerProduct,
        researchProduct: researchProduct,
        submission: submission || null,
      }
    });

  } catch (error) {
    console.error('Error fetching offer product info:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch product info'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/offer?productId=xxx&clearType=insights|improvements|all
 *
 * Behavior depends on clearType:
 * - 'insights' (default): clears 'reviews' and 'insights' fields; keeps the row.
 * - 'improvements': clears 'improvements' field; keeps the row.
 * - 'all': deletes the offer_products row AND flips research_products.is_offered=false
 *   for that product. Used when the user removes the offering from the Vetted page.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const serverSupabase = getSupabaseClient(token);

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const clearType = searchParams.get('clearType') || 'insights';

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (clearType !== 'insights' && clearType !== 'improvements' && clearType !== 'all') {
      return NextResponse.json(
        { success: false, error: 'Invalid clearType. Must be "insights", "improvements", or "all"' },
        { status: 400 }
      );
    }

    // clearType='all' — delete the offer row and flip research_products.is_offered=false.
    if (clearType === 'all') {
      const adminSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Confirm the research_product belongs to this user before touching anything.
      const { data: owned, error: ownershipError } = await adminSupabase
        .from('research_products')
        .select('id')
        .eq('id', productId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownershipError) {
        console.error('DELETE /api/offer (all): ownership check failed:', ownershipError);
        return NextResponse.json(
          { success: false, error: 'Database error: ' + ownershipError.message },
          { status: 500 }
        );
      }

      if (!owned) {
        return NextResponse.json(
          { success: false, error: 'Product not found for this user' },
          { status: 404 }
        );
      }

      const { error: offerDeleteError } = await adminSupabase
        .from('offer_products')
        .delete()
        .eq('product_id', productId);

      if (offerDeleteError) {
        console.error('DELETE /api/offer (all): failed to delete offer_products row:', offerDeleteError);
        return NextResponse.json(
          { success: false, error: 'Failed to delete offer: ' + offerDeleteError.message },
          { status: 500 }
        );
      }

      const { error: flagError } = await adminSupabase
        .from('research_products')
        .update({ is_offered: false, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('user_id', user.id);

      if (flagError) {
        console.error('DELETE /api/offer (all): failed to clear is_offered flag:', flagError);
        return NextResponse.json(
          { success: false, error: 'Failed to clear is_offered flag: ' + flagError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Deleted offer and cleared is_offered flag for product ${productId}`,
      });
    }

    // Partial clear: keep the row, null out specific fields.
    const updateData: any = { updated_at: new Date().toISOString() };
    if (clearType === 'insights') {
      updateData.reviews = [];
      updateData.insights = null;
    } else if (clearType === 'improvements') {
      updateData.improvements = null;
    }

    const { error: updateError } = await serverSupabase
      .from('offer_products')
      .update(updateData)
      .eq('product_id', productId);

    if (updateError) {
      console.error(`Error clearing ${clearType}:`, updateError);
      return NextResponse.json(
        { success: false, error: `Failed to clear ${clearType}: ` + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully cleared ${clearType} for product ${productId}`,
    });
  } catch (error) {
    console.error('Error clearing offer product data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear offer product data',
      },
      { status: 500 }
    );
  }
}
