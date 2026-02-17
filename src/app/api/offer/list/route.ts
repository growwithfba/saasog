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
 * GET /api/offer/list
 * 
 * Returns a combined list of products for the offer page:
 * 1. Products from offer_products table (user's offers)
 * 2. Products from submissions table (user's vetted products)
 * 
 * The list is deduplicated by research_product_id/product_id
 * Each product includes:
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
 *     offerProduct: {...} | null,
 *     submission: {...} | null,
 *     category: string | null,
 *     brand: string | null,
 *     is_offered: boolean,
 *     is_sourced: boolean,
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

    console.log(`GET /api/offer/list: Fetching offer list for user: ${user.id}`);

    // First, fetch offer_products for this user - only show products that exist in offer_products
    const { data: offerProducts, error: offerError } = await serverSupabase
      .from('offer_products')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (offerError) {
      console.error('Error fetching offer products:', offerError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch offer products: ' + offerError.message },
        { status: 500 }
      );
    }

    if (!offerProducts || offerProducts.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No offer products found'
      });
    }

    // Get product IDs from offer_products
    const productIds = offerProducts.map((op: any) => op.product_id);

    console.log(`GET /api/offer/list: Found ${productIds.length} products in offer_products`);

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
    const offerProductsMap = new Map();
    offerProducts.forEach((op: any) => {
      offerProductsMap.set(op.product_id, op);
    });

    const researchProductsMap = new Map();
    (researchProducts || []).forEach((rp: any) => {
      researchProductsMap.set(rp.id, rp);
    });

    const submissionsMap = new Map();
    (submissions || []).forEach((sub: any) => {
      if (sub.research_products_id) {
        submissionsMap.set(sub.research_products_id, sub);
      }
    });

    // Combine data - iterate over offer_products (these are the products we want to show)
    const combinedData = offerProducts
      .map((offerProduct: any) => {
        const productId = offerProduct.product_id;
        const researchProduct = researchProductsMap.get(productId);
        
        // Skip if research product not found
        if (!researchProduct) {
          console.warn(`Research product not found for offer_product: ${productId}`);
          return null;
        }

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

      // Determine offering status based on offer_product data
      let offeringStatus = 'none'; // default
      if (offerProduct) {
        const hasInsights = offerProduct.insights && (
          offerProduct.insights.topLikes?.trim() ||
          offerProduct.insights.topDislikes?.trim() ||
          offerProduct.insights.importantInsights?.trim() ||
          offerProduct.insights.importantQuestions?.trim()
        );

        const hasImprovements = offerProduct.improvements && (
          (Array.isArray(offerProduct.improvements.quantity) && offerProduct.improvements.quantity.length > 0) ||
          (Array.isArray(offerProduct.improvements.functionality) && offerProduct.improvements.functionality.length > 0) ||
          (Array.isArray(offerProduct.improvements.quality) && offerProduct.improvements.quality.length > 0) ||
          (Array.isArray(offerProduct.improvements.aesthetic) && offerProduct.improvements.aesthetic.length > 0) ||
          (Array.isArray(offerProduct.improvements.bundle) && offerProduct.improvements.bundle.length > 0)
        );

        const hasReviews = Array.isArray(offerProduct.reviews) && offerProduct.reviews.length > 0;

        if (hasInsights && hasImprovements) {
          offeringStatus = 'Completed';
        } else if (hasImprovements) {
          offeringStatus = 'SSPs Finalized';
        } else if (hasInsights) {
          offeringStatus = 'Building SSPs';
        } else {
          offeringStatus = 'Not Started';
        }
      }

        return {
          asin: researchProduct.asin,
          title: researchProduct.display_title || researchProduct.title || 'Untitled Product',
          researchProductId: productId,
          offerProduct: offerProduct,
          submission: submission,
          category: researchProduct.category || null,
          brand: researchProduct.brand || null,
          is_offered: researchProduct.is_offered || false,
          is_sourced: researchProduct.is_sourced || false,
          vettingStatus,
          vettingScore,
          offeringStatus,
          salesPrice: researchProduct.extra_data?.salesPrice || null,
          offerUpdatedAt: offerProduct?.updated_at || null,
          updated_at: researchProduct.updated_at || researchProduct.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null); // Filter out null items

    // Sort by most recently updated (offer_products.updated_at)
    combinedData.sort((a, b) => {
      const dateA = new Date(a.offerUpdatedAt || a.updated_at || 0).getTime();
      const dateB = new Date(b.offerUpdatedAt || b.updated_at || 0).getTime();
      return dateB - dateA;
    });

    console.log(`GET /api/offer/list: Returning ${combinedData.length} products`);

    return NextResponse.json({
      success: true,
      data: combinedData,
      count: combinedData.length
    });

  } catch (error) {
    console.error('Error fetching offer list:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch offer list'
      },
      { status: 500 }
    );
  }
}
