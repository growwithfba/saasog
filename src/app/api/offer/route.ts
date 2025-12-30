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
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     offerProduct: {...},      // Data from offer_products
 *     researchProduct: {...},   // Data from research_products (when queried by asin)
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
 * DELETE /api/offer?productId=xxx
 * 
 * Deletes an offer product record from the offer_products table.
 * 
 * Query Parameters:
 * - productId: string (required) - The product_id to delete
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 */
export async function DELETE(request: NextRequest) {
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

    // Get productId from query params
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    console.log(`DELETE /api/offer: Deleting offer product for productId: ${productId}`);

    // Delete the offer_products record
    const { error: deleteError } = await serverSupabase
      .from('offer_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      console.error('Error deleting offer product:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete offer product: ' + deleteError.message },
        { status: 500 }
      );
    }

    console.log(`DELETE /api/offer: Successfully deleted offer product for productId: ${productId}`);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted offer product for ${productId}`
    });

  } catch (error) {
    console.error('Error deleting offer product:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete offer product'
      },
      { status: 500 }
    );
  }
}
