import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/research
 * Obtiene todos los registros de research_products del usuario autenticado
 */
export async function GET(request: NextRequest) {
  try {
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('GET research: Using authenticated client with JWT token');
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
      console.log('GET research: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('GET research: Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    console.log('GET research: Fetching research_products for user:', user.id);
    
    // Get optional query parameters for filtering
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    const status = url.searchParams.get('status');

    console.log('GET research: User ID:', user.id);
    
    // Build the query
    let query = serverSupabase
      .from('research_products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    // Apply optional filters
    if (status) {
      query = query.eq('status', status);
    }
    
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }
    
    if (offset) {
      const offsetNum = parseInt(offset, 10);
      if (!isNaN(offsetNum) && offsetNum >= 0) {
        query = query.range(offsetNum, offsetNum + (limit ? parseInt(limit, 10) : 100) - 1);
      }
    }
    
    // Execute the query
    const { data: researchProducts, error } = await query;
    
    if (error) {
      console.error('GET research: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    console.log(`GET research: Retrieved ${researchProducts?.length || 0} research products`);
    
    return NextResponse.json({
      success: true,
      data: researchProducts || [],
      count: researchProducts?.length || 0
    });
    
  } catch (error) {
    console.error('GET research: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch research products' 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/research
 * Crea un nuevo registro en research_products para el usuario autenticado
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('POST research: Using authenticated client with JWT token');
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
      console.log('POST research: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('POST research: Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }
    
    // Prepare the data with user_id
    const researchProductData = {
      ...body,
      user_id: user.id
    };
    
    console.log('POST research: Creating research product for user:', user.id);
    
    // Insert the new research product
    const { data: researchProduct, error } = await serverSupabase
      .from('research_products')
      .insert(researchProductData)
      .select()
      .single();
    
    if (error) {
      console.error('POST research: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    console.log('POST research: Successfully created research product:', researchProduct.id);
    
    return NextResponse.json({
      success: true,
      data: researchProduct
    }, { status: 201 });
    
  } catch (error) {
    console.error('POST research: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create research product' 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/research
 * Inserta múltiples registros en research_products (bulk insert)
 * Body: { products: [{ asin, title, category, brand, price, monthly_revenue, monthly_units_sold, extra_data }, ...] }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate that products array exists
    if (!body.products || !Array.isArray(body.products)) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain a "products" array' },
        { status: 400 }
      );
    }
    
    // Validate that array is not empty
    if (body.products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Products array cannot be empty' },
        { status: 400 }
      );
    }
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('PUT research (bulk): Using authenticated client with JWT token');
      serverSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );
    } else {
      console.log('PUT research (bulk): No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('PUT research (bulk): Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! 
    );
    
    const now = new Date().toISOString();
    
    // Prepare bulk data with user_id and updated_at for each product
    const bulkData = body.products.map((product: any) => {
      // Validate required fields
      if (!product.asin) {
        throw new Error('Each product must have an "asin" field');
      }
      
      return {
        user_id: user.id,
        asin: product.asin,
        title: product.title || null,
        category: product.category || null,
        brand: product.brand || null,
        price: product.price !== undefined ? product.price : null,
        monthly_revenue: product.monthly_revenue !== undefined ? product.monthly_revenue : null,
        monthly_units_sold: product.monthly_units_sold !== undefined ? product.monthly_units_sold : null,
        extra_data: product.extra_data || null,
        updated_at: now
      };
    });

    console.log('Bulk data:', bulkData);
    
    console.log(`PUT research (bulk): Inserting ${bulkData.length} products for user:`, user.id);
    
    // Bulk insert all products
    const { data: insertedProducts, error } = await serverSupabase
      .from('research_products')
      .insert(bulkData)
      .select();
    
    if (error) {
      console.error('PUT research (bulk): Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    console.log(`PUT research (bulk): Successfully inserted ${insertedProducts?.length || 0} products`);
    
    return NextResponse.json({
      success: true,
      data: insertedProducts || [],
      count: insertedProducts?.length || 0
    }, { status: 201 });
    
  } catch (error) {
    console.error('PUT research (bulk): Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create research products' 
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/research
 * Actualiza múltiples registros en research_products basándose en ASIN (bulk update)
 * Body: { products: [{ asin, title?, category?, brand?, price?, monthly_revenue?, monthly_units_sold?, extra_data?, is_vetted?, is_offered?, is_sourced? }, ...] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate that products array exists
    if (!body.products || !Array.isArray(body.products)) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain a "products" array' },
        { status: 400 }
      );
    }
    
    // Validate that array is not empty
    if (body.products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Products array cannot be empty' },
        { status: 400 }
      );
    }
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('PATCH research (bulk update): Using authenticated client with JWT token');
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
      console.log('PATCH research (bulk update): No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('PATCH research (bulk update): Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();
    const updatedProducts: any[] = [];
    const errors: any[] = [];
    
    // Process each product update
    const updatePromises = body.products.map(async (product: any) => {
      // Validate required field
      if (!product.asin) {
        errors.push({ asin: product.asin || 'unknown', error: 'ASIN is required' });
        return null;
      }
      
      // Build update object with only provided fields
      const updateData: any = {
        updated_at: now
      };
      
      // Only include fields that are explicitly provided (not undefined)
      if (product.title !== undefined) updateData.title = product.title;
      if (product.category !== undefined) updateData.category = product.category;
      if (product.brand !== undefined) updateData.brand = product.brand;
      if (product.price !== undefined) updateData.price = product.price;
      if (product.monthly_revenue !== undefined) updateData.monthly_revenue = product.monthly_revenue;
      if (product.monthly_units_sold !== undefined) updateData.monthly_units_sold = product.monthly_units_sold;
      if (product.extra_data !== undefined) updateData.extra_data = product.extra_data;
      if (product.is_vetted !== undefined) updateData.is_vetted = product.is_vetted;
      if (product.is_offered !== undefined) updateData.is_offered = product.is_offered;
      if (product.is_sourced !== undefined) updateData.is_sourced = product.is_sourced;
      
      try {
        // Update product where asin and user_id match
        const { data: updatedProduct, error: updateError } = await serverSupabase
          .from('research_products')
          .update(updateData)
          .eq('asin', product.asin)
          .eq('user_id', user.id)
          .select()
          .single();
        
        if (updateError) {
          console.error(`PATCH research (bulk update): Error updating product ${product.asin}:`, updateError);
          errors.push({ asin: product.asin, error: updateError.message });
          return null;
        }
        
        if (updatedProduct) {
          return updatedProduct;
        } else {
          errors.push({ asin: product.asin, error: 'Product not found or no changes made' });
          return null;
        }
      } catch (err) {
        console.error(`PATCH research (bulk update): Unexpected error for product ${product.asin}:`, err);
        errors.push({ 
          asin: product.asin, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
        return null;
      }
    });
    
    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);
    
    // Filter out null results (errors)
    const successfulUpdates = results.filter((result): result is any => result !== null);
    
    console.log(`PATCH research (bulk update): Updated ${successfulUpdates.length} out of ${body.products.length} products for user:`, user.id);
    
    if (errors.length > 0) {
      console.warn(`PATCH research (bulk update): ${errors.length} products failed to update:`, errors);
    }
    
    return NextResponse.json({
      success: true,
      data: successfulUpdates,
      count: successfulUpdates.length,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200 });
    
  } catch (error) {
    console.error('PATCH research (bulk update): Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update research products' 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/research
 * Elimina múltiples productos de research_products basándose en sus IDs
 * Body: { productIds: [id1, id2, ...] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate that productIds array exists
    if (!body.productIds || !Array.isArray(body.productIds)) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain a "productIds" array' },
        { status: 400 }
      );
    }
    
    // Validate that array is not empty
    if (body.productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ProductIds array cannot be empty' },
        { status: 400 }
      );
    }
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('DELETE research: Using authenticated client with JWT token');
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
      console.log('DELETE research: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('DELETE research: Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    console.log(`DELETE research: Deleting ${body.productIds.length} products for user:`, user.id);
    
    // Delete products where id is in the array and user_id matches
    const { data: deletedProducts, error } = await serverSupabase
      .from('research_products')
      .delete()
      .in('id', body.productIds)
      .eq('user_id', user.id)
      .select();
    
    if (error) {
      console.error('DELETE research: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    console.log(`DELETE research: Successfully deleted ${deletedProducts?.length || 0} products`);
    
    return NextResponse.json({
      success: true,
      deletedCount: deletedProducts?.length || 0,
      deletedProducts: deletedProducts || []
    }, { status: 200 });
    
  } catch (error) {
    console.error('DELETE research: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete research products' 
      },
      { status: 500 }
    );
  }
}
