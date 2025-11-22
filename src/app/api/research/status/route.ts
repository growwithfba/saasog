import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * PATCH /api/research/status
 * Updates the status (is_vetted, is_offered, or is_sourced) for one or more research_products
 * Body: { 
 *   productIds: string[] | string,  // Array of product IDs or single ID
 *   status: 'vetted' | 'offered' | 'sourced',  // Which status to update
 *   value?: boolean  // Optional: true or false (defaults to true)
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.productIds) {
      return NextResponse.json(
        { success: false, error: 'productIds is required' },
        { status: 400 }
      );
    }
    
    if (!body.status) {
      return NextResponse.json(
        { success: false, error: 'status is required. Must be one of: vetted, offered, sourced' },
        { status: 400 }
      );
    }
    
    // Validate status value
    const validStatuses = ['vetted', 'offered', 'sourced'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Normalize productIds to array
    const productIds = Array.isArray(body.productIds) ? body.productIds : [body.productIds];
    
    if (productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one productId is required' },
        { status: 400 }
      );
    }
    
    // Get the value to set (defaults to true)
    const value = body.value !== undefined ? body.value : true;
    
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      console.log('PATCH research/status: Using authenticated client with JWT token');
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
      console.log('PATCH research/status: No token found, using server client with cookies');
      serverSupabase = createClient();
    }
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      console.error('PATCH research/status: Authentication error:', authError);
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }
    
    // Map status to column name
    const statusColumnMap: Record<string, string> = {
      'vetted': 'is_vetted',
      'offered': 'is_offered',
      'sourced': 'is_sourced'
    };
    
    const columnName = statusColumnMap[body.status];
    const now = new Date().toISOString();
    
    // Build update object
    const updateData: any = {
      [columnName]: value,
      updated_at: now
    };
    
    console.log(`PATCH research/status: Updating ${productIds.length} products for user ${user.id}, setting ${columnName} to ${value}`);
    console.log(`PATCH research/status: Product IDs:`, productIds);
    console.log(`PATCH research/status: Update data:`, updateData);
    
    // First, verify the products exist and belong to the user
    const { data: existingProducts, error: checkError } = await serverSupabase
      .from('research_products')
      .select('id, user_id, is_vetted, is_offered, is_sourced')
      .in('id', productIds)
      .eq('user_id', user.id);
    
    if (checkError) {
      console.error('PATCH research/status: Error checking products:', checkError);
      return NextResponse.json(
        { success: false, error: 'Database error checking products: ' + checkError.message },
        { status: 500 }
      );
    }
    
    if (!existingProducts || existingProducts.length === 0) {
      console.warn(`PATCH research/status: No products found matching IDs: ${productIds.join(', ')} for user ${user.id}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'No products found matching the provided IDs for this user',
          requestedIds: productIds,
          foundCount: 0
        },
        { status: 404 }
      );
    }
    
    if (existingProducts.length !== productIds.length) {
      console.warn(`PATCH research/status: Only found ${existingProducts.length} out of ${productIds.length} products`);
      const foundIds = existingProducts.map(p => p.id);
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      console.warn(`PATCH research/status: Missing product IDs:`, missingIds);
    }
    
    // Use service role key for the update to bypass RLS, but only update products that belong to the user
    // (we've already verified ownership above)
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Update all products matching the IDs and user_id
    // Using admin client to bypass RLS, but still filtering by user_id for security
    const { data: updatedProducts, error: updateError } = await adminSupabase
      .from('research_products')
      .update(updateData)
      .in('id', productIds)
      .eq('user_id', user.id)
      .select();
    
    if (updateError) {
      console.error('PATCH research/status: Supabase update error:', updateError);
      console.error('PATCH research/status: Error details:', JSON.stringify(updateError, null, 2));
      return NextResponse.json(
        { 
          success: false, 
          error: 'Database error: ' + updateError.message,
          details: updateError
        },
        { status: 500 }
      );
    }
    
    console.log(`PATCH research/status: Successfully updated ${updatedProducts?.length || 0} products`);
    console.log(`PATCH research/status: Updated products:`, updatedProducts);
    
    if (!updatedProducts || updatedProducts.length === 0) {
      console.warn('PATCH research/status: Update returned 200 but no products were updated. This might be an RLS issue.');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Update operation completed but no rows were modified. This might be due to Row Level Security policies.',
          existingProducts: existingProducts.length,
          requestedIds: productIds
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: updatedProducts || [],
      count: updatedProducts?.length || 0,
      status: body.status,
      value: value
    }, { status: 200 });
    
  } catch (error) {
    console.error('PATCH research/status: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update research product status' 
      },
      { status: 500 }
    );
  }
}

