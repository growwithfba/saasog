import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

type SupplierStatusLabel = 
  | 'Not Started' 
  | 'In Progress' 
  | 'Sample Ordered' 
  | 'Finalizing Order' 
  | 'Purchase Order Sent';

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
 * Determine supplier status based on sourcing data
 */
function getSupplierStatus(sourcingProduct: any): SupplierStatusLabel {
  if (!sourcingProduct) return 'Not Started';

  // Priority 1: Purchase Order Sent
  if (sourcingProduct.purchase_order_downloaded === true) {
    return 'Purchase Order Sent';
  }

  // Priority 2: Finalizing Order - check if any supplier has place order fields
  const supplierQuotes = sourcingProduct.supplier_quotes || {};
  const hasPlaceOrderData = Object.values(supplierQuotes).some((quote: any) => {
    const placeOrder = quote?.placeOrder || {};
    return Object.keys(placeOrder).length > 0 && Object.values(placeOrder).some(val => val);
  });

  if (hasPlaceOrderData) {
    return 'Finalizing Order';
  }

  // Priority 3: Sample Ordered - check profitCalculator or any supplier
  if (sourcingProduct.profit_calculator?.sampleOrdered === true) {
    return 'Sample Ordered';
  }

  const hasSampleInQuotes = Object.values(supplierQuotes).some((quote: any) => {
    const basic = quote?.basic || {};
    const advanced = quote?.advanced || {};
    return basic.sampleOrdered === true || 
           basic.sampleOrdered === 'Yes' ||
           advanced.sampleOrdered === true ||
           advanced.sampleOrdered === 'Yes';
  });

  if (hasSampleInQuotes) {
    return 'Sample Ordered';
  }

  // Priority 4: In Progress - check if any supplier has data
  const hasSupplierData = Object.values(supplierQuotes).some((quote: any) => {
    const basic = quote?.basic || {};
    return !!(
      basic.supplierName?.trim() ||
      basic.companyName?.trim() ||
      basic.alibabaUrl?.trim() ||
      basic.costPerUnitShortTerm !== null ||
      basic.moqShortTerm !== null
    );
  });

  if (hasSupplierData) {
    return 'In Progress';
  }

  // Priority 5: Not Started (default)
  return 'Not Started';
}

/**
 * GET /api/sourcing/list
 * 
 * Returns a list of products for the sourcing page.
 * Only shows products that exist in sourcing_products table.
 * 
 * For each product, combines:
 * - Sourcing data from sourcing_products
 * - Product info from research_products
 * - Offer data from offer_products (if exists)
 * - Vetting data from submissions (if exists)
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: Array<{
 *     asin: string,
 *     title: string,
 *     researchProductId: string,
 *     sourcingProduct: {...},
 *     offerProduct: {...} | null,
 *     submission: {...} | null,
 *     category: string | null,
 *     brand: string | null,
 *     is_offered: boolean,
 *     is_sourced: boolean,
 *     vettingStatus: string | null,
 *     vettingScore: number | null,
 *     sourcingStatus: string,
 *     supplierCount: number,
 *     updated_at: string
 *   }>
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

    console.log(`GET /api/sourcing/list: Fetching sourcing list for user: ${user.id}`);

    // First, fetch sourcing_products for this user - only show products that exist in sourcing_products
    const { data: sourcingProducts, error: sourcingError } = await serverSupabase
      .from('sourcing_products')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (sourcingError) {
      console.error('Error fetching sourcing products:', sourcingError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch sourcing products: ' + sourcingError.message },
        { status: 500 }
      );
    }

    if (!sourcingProducts || sourcingProducts.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No sourcing products found'
      });
    }

    // Get product IDs from sourcing_products
    const productIds = sourcingProducts.map((sp: any) => sp.product_id);

    console.log(`GET /api/sourcing/list: Found ${productIds.length} products in sourcing_products`);

    // Fetch research products for these product IDs
    const { data: researchProducts, error: researchError } = await serverSupabase
      .from('research_products')
      .select('*')
      .in('id', productIds)
      .eq('user_id', user.id);

    if (researchError) {
      console.error('Error fetching research products:', researchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch research products: ' + researchError.message },
        { status: 500 }
      );
    }

    // Fetch offer_products for these product IDs
    const { data: offerProducts, error: offerError } = await serverSupabase
      .from('offer_products')
      .select('*')
      .in('product_id', productIds);

    if (offerError) {
      console.error('Error fetching offer products:', offerError);
      // Continue without offer products
    }

    // Fetch submissions for these products
    const { data: submissions, error: submissionsError } = await serverSupabase
      .from('submissions')
      .select('*')
      .in('research_products_id', productIds);

    if (submissionsError) {
      console.error('Error fetching submissions:', submissionsError);
      // Continue without submissions
    }

    // Create maps for quick lookup
    const sourcingProductsMap = new Map();
    sourcingProducts.forEach((sp: any) => {
      sourcingProductsMap.set(sp.product_id, sp);
    });

    const researchProductsMap = new Map();
    (researchProducts || []).forEach((rp: any) => {
      researchProductsMap.set(rp.id, rp);
    });

    const offerProductsMap = new Map();
    (offerProducts || []).forEach((op: any) => {
      offerProductsMap.set(op.product_id, op);
    });

    const submissionsMap = new Map();
    (submissions || []).forEach((sub: any) => {
      if (sub.research_products_id) {
        submissionsMap.set(sub.research_products_id, sub);
      }
    });

    // Combine data - iterate over sourcing_products (these are the products we want to show)
    const combinedData = sourcingProducts
      .map((sourcingProduct: any) => {
        const productId = sourcingProduct.product_id;
        const researchProduct = researchProductsMap.get(productId);
        
        // Skip if research product not found
        if (!researchProduct) {
          console.warn(`Research product not found for sourcing_product: ${productId}`);
          return null;
        }

        const offerProduct = offerProductsMap.get(productId) || null;
        const submission = submissionsMap.get(productId) || null;

        // Determine vetting status and score
        const vettingStatus = submission?.status || 
                             submission?.submission_data?.marketScore?.status || 
                             researchProduct?.extra_data?.status || 
                             null;
        
        const vettingScore = submission?.score !== undefined 
          ? submission.score 
          : (submission?.submission_data?.marketScore?.score !== undefined 
              ? submission.submission_data.marketScore.score 
              : (researchProduct?.extra_data?.score || null));

        // Determine supplier status based on sourcing_product data
        const supplierStatus = getSupplierStatus(sourcingProduct);

        // Count suppliers
        const supplierQuotes = sourcingProduct.supplier_quotes || {};
        const supplierCount = Object.keys(supplierQuotes).length;

        return {
          asin: researchProduct.asin,
          title: researchProduct.display_title || researchProduct.title || 'Untitled Product',
          researchProductId: productId,
          sourcingProduct: sourcingProduct,
          offerProduct: offerProduct,
          submission: submission,
          category: researchProduct.category || null,
          brand: researchProduct.brand || null,
          is_offered: researchProduct.is_offered || false,
          is_sourced: researchProduct.is_sourced || false,
          vettingStatus,
          vettingScore,
          supplierStatus,
          supplierCount,
          salesPrice: researchProduct.extra_data?.salesPrice || null,
          sourcingUpdatedAt: sourcingProduct.updated_at || null,
          updated_at: researchProduct.updated_at || researchProduct.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null); // Filter out null items

    // Sort by most recently updated (sourcing_products.updated_at)
    combinedData.sort((a, b) => {
      const dateA = new Date(a.sourcingUpdatedAt || a.updated_at || 0).getTime();
      const dateB = new Date(b.sourcingUpdatedAt || b.updated_at || 0).getTime();
      return dateB - dateA;
    });

    console.log(`GET /api/sourcing/list: Returning ${combinedData.length} products`);

    return NextResponse.json({
      success: true,
      data: combinedData,
      count: combinedData.length
    });

  } catch (error) {
    console.error('Error fetching sourcing list:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sourcing list'
      },
      { status: 500 }
    );
  }
}
