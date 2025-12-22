import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Interface for parsed review from CSV
interface Review {
  title: string;
  comment: string;
  stars: number | string;
}

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
 * POST /api/offer/save-reviews
 * 
 * Saves customer reviews to the offer_products table
 * 
 * Request Body:
 * {
 *   productId: string,
 *   reviews: Review[]
 * }
 */
export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { productId, reviews } = body as { productId: string; reviews: Review[] };

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json(
        { success: false, error: 'No reviews provided or invalid format' },
        { status: 400 }
      );
    }

    console.log(`Saving ${reviews.length} reviews for product ${productId}`);

    // Store reviews in offer_products table
    const { error: upsertError } = await serverSupabase
      .from('offer_products')
      .insert({
        product_id: productId,
        reviews: reviews,
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error storing reviews:', upsertError);
      return NextResponse.json(
        { success: false, error: 'Failed to store reviews: ' + upsertError.message },
        { status: 500 }
      );
    }

    console.log('Reviews stored successfully in offer_products');

    return NextResponse.json({
      success: true,
      message: `Successfully stored ${reviews.length} reviews for product ${productId}`
    });

  } catch (error) {
    console.error('Error saving reviews:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save reviews'
      },
      { status: 500 }
    );
  }
}

