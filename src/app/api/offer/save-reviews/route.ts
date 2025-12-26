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
 * Saves customer reviews and analysis insights to the offer_products table
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
    const { productId, reviews = [], insights, user_id } = body as { productId: string; reviews?: Review[]; insights?: any; user_id?: string };

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (reviews && !Array.isArray(reviews)) {
      return NextResponse.json(
        { success: false, error: 'Invalid reviews format' },
        { status: 400 }
      );
    }

    console.log(`Saving ${reviews.length} reviews for product ${productId} with insights: ${insights ? 'yes' : 'no'}`);

    // Upsert by product_id to insert or update existing record
    const { data: upserted, error: upsertError } = await serverSupabase
      .from('offer_products')
      .upsert(
        {
          product_id: productId,
          reviews,
          insights: insights || null,
          user_id: user_id || null
        },
        { onConflict: 'product_id' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error storing reviews/insights:', upsertError);
      return NextResponse.json(
        { success: false, error: 'Failed to store reviews/insights: ' + upsertError.message },
        { status: 500 }
      );
    }

    console.log('Upserted offer_product with reviews/insights:', upserted);

    return NextResponse.json({
      success: true,
      message: `Successfully stored ${reviews.length} reviews for product ${productId}`,
      data: { productId, reviewsStored: reviews.length }
    });

  } catch (error) {
    console.error('Error saving reviews/insights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save reviews/insights'
      },
      { status: 500 }
    );
  }
}

