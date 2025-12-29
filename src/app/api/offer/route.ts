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
 * GET /api/offer?productId=xxx
 * 
 * Retrieves product information from offer_products based on the product_id
 * stored in offer_products table.
 * 
 * Query Parameters:
 * - productId: string (required) - The product_id from offer_products table
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     offerProduct: {...},      // Data from offer_products
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

    // Get productId from query params
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    console.log(`GET /api/offer: Fetching product info for productId: ${productId}`);

    // First, fetch the offer_products record
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
        offerProduct: offerProduct
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
