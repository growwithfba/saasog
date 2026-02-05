import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Interface for parsed review from CSV
interface Review {
  title: string;
  body: string;
  rating: number | string;
}

const MAX_REVIEWS = 200;

const makeReviewKey = (review: Review) => {
  return [
    (review.title || '').trim().toLowerCase(),
    (review.body || '').trim().toLowerCase(),
    String(review.rating ?? '').trim().toLowerCase()
  ].join('||');
};

const dedupeReviews = (reviews: Review[]) => {
  const seen = new Set<string>();
  const unique: Review[] = [];
  for (const review of reviews) {
    const key = makeReviewKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(review);
  }
  return unique;
};

const capReviews = (reviews: Review[], cap = MAX_REVIEWS) => reviews.slice(0, cap);

const normalizeStoredReview = (review: any): Review | null => {
  if (!review) return null;
  const ratingRaw = review.rating ?? review.stars ?? review.star ?? review.score;
  const ratingValue = Number(ratingRaw);
  const rating = Number.isFinite(ratingValue) ? ratingValue : ratingRaw ?? 0;
  const title = review.title ?? '';
  const body = review.body ?? review.comment ?? review.content ?? '';
  return { title, body, rating };
};

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
    const { productId, reviews = [], insights, user_id, append = false } = body as { productId: string; reviews?: Review[]; insights?: any; user_id?: string; append?: boolean };

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

    let existingReviews: Review[] = [];
    let existingInsights: any = null;
    if (append || insights === undefined) {
      const { data: existing, error: fetchError } = await serverSupabase
        .from('offer_products')
        .select('reviews,insights')
        .eq('product_id', productId)
        .single();
      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching existing reviews:', fetchError);
      }
      if (Array.isArray(existing?.reviews)) {
        existingReviews = existing.reviews.map(normalizeStoredReview).filter(Boolean) as Review[];
      }
      existingInsights = existing?.insights ?? null;
    }

    const normalizedIncoming = reviews.map(normalizeStoredReview).filter(Boolean) as Review[];
    const combined = append ? [...existingReviews, ...normalizedIncoming] : normalizedIncoming;
    const deduped = dedupeReviews(combined);
    const capReached = deduped.length > MAX_REVIEWS;
    const cappedReviews = capReviews(deduped);
    const insightsToStore = insights !== undefined ? insights : existingInsights;

    // Get ASIN from research_products
    const { data: researchProduct, error: researchFetchError } = await serverSupabase
      .from('research_products')
      .select('asin')
      .eq('id', productId)
      .single();

    if (researchFetchError) {
      console.error('Error fetching research product for ASIN:', researchFetchError);
    }

    const asin = researchProduct?.asin || null;

    // Upsert by product_id to insert or update existing record
    const { data: upserted, error: upsertError } = await serverSupabase
      .from('offer_products')
      .upsert(
        {
          product_id: productId,
          asin: asin,
          reviews: cappedReviews,
          ...(insightsToStore !== undefined ? { insights: insightsToStore } : {}),
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
      message: `Successfully stored ${cappedReviews.length} reviews for product ${productId}`,
      data: {
        productId,
        reviewsStored: cappedReviews.length,
        totalStoredCount: cappedReviews.length,
        capReached
      }
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

