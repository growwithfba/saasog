import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * PATCH /api/products/display-title
 * Actualiza el título (display title) de un producto en research_products
 * Body: { asin: string, displayTitle: string, originalTitle?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }
    
    if (!body.displayTitle || typeof body.displayTitle !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Valid displayTitle is required' },
        { status: 400 }
      );
    }
    
    // Sanitize the title (trim and limit length)
    const displayTitle = body.displayTitle.trim();
    if (!displayTitle) {
      return NextResponse.json(
        { success: false, error: 'Display title cannot be empty' },
        { status: 400 }
      );
    }
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('PATCH display-title: Using authenticated client with JWT token');
      serverSupabase = createSupabaseClient(
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
    } else {
      console.log('PATCH display-title: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('PATCH display-title: Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }
    
    console.log(`PATCH display-title: Updating title for ASIN ${body.asin} (user: ${user.id})`);
    
    const now = new Date().toISOString();

    
    
    // Update the product title
    const { data: updatedProduct, error } = await serverSupabase
      .from('research_products')
      .update({
        title: displayTitle,
        updated_at: now
      })
      .eq('id', body.id)
      .select();
    
    if (error) {
      console.error('PATCH display-title: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    if (!updatedProduct) {
      console.warn(`PATCH display-title: Product not found for ASIN ${body.asin}`);
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }
    
    console.log(`PATCH display-title: Successfully updated title for ASIN ${body.asin}`);
    
    return NextResponse.json({
      success: true,
      displayTitle: updatedProduct.title,
      product: updatedProduct
    }, { status: 200 });
    
  } catch (error) {
    console.error('PATCH display-title: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update display title' 
      },
      { status: 500 }
    );
  }
}

