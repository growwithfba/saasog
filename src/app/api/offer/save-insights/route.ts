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
 * POST /api/offer/save-insights
 *
 * Saves review insights to the offer_products table
 *
 * Request Body:
 * {
 *   productId: string,
 *   insights: object
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

    const body = await request.json();
    const { productId, insights, user_id } = body as { productId: string; insights?: any; user_id?: string };

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (!insights) {
      return NextResponse.json(
        { success: false, error: 'No insights provided' },
        { status: 400 }
      );
    }

    const { data: upserted, error: upsertError } = await serverSupabase
      .from('offer_products')
      .upsert(
        {
          product_id: productId,
          insights,
          user_id: user_id || user.id || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'product_id' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error storing insights:', upsertError);
      return NextResponse.json(
        { success: false, error: 'Failed to store insights: ' + upsertError.message },
        { status: 500 }
      );
    }

    console.log('Upserted offer_product with insights:', upserted?.product_id);

    return NextResponse.json({
      success: true,
      message: `Successfully stored insights for product ${productId}`,
      data: { productId }
    });
  } catch (error) {
    console.error('Error saving insights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save insights'
      },
      { status: 500 }
    );
  }
}
