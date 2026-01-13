import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseServer'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Helper to get authenticated Supabase client
 */
function getSupabaseClient(token: string | null) {
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
 * Transform supplier quotes array to the new object structure
 * Input: SupplierQuoteRow[] (array of supplier quotes)
 * Output: { [supplierId]: { basic: {...}, advanced: {...} } }
 */
function transformSupplierQuotesToObject(supplierQuotes: any[]): Record<string, { basic: any; advanced: any }> {
  const result: Record<string, { basic: any; advanced: any }> = {};
  
  if (!Array.isArray(supplierQuotes)) return result;
  
  supplierQuotes.forEach((quote, index) => {
    const supplierId = quote.id || `supplier_${index + 1}`;
    
    // Basic fields - essential supplier and pricing info
    const basic = {
      id: quote.id,
      displayName: quote.displayName,
      supplierName: quote.supplierName,
      companyName: quote.companyName,
      alibabaUrl: quote.alibabaUrl,
      supplierAddress: quote.supplierAddress,
      supplierContactNumber: quote.supplierContactNumber,
      supplierEmail: quote.supplierEmail,
      
      // Pricing / Terms (Basic)
      costPerUnitShortTerm: quote.costPerUnitShortTerm,
      exwUnitCost: quote.exwUnitCost,
      incoterms: quote.incoterms,
      ddpPrice: quote.ddpPrice,
      moqShortTerm: quote.moqShortTerm,
      moq: quote.moq,
      freightDutyCost: quote.freightDutyCost,
      freightDutyIncludedInSalesPrice: quote.freightDutyIncludedInSalesPrice,
      
      // Single Product Package (Basic)
      singleProductPackageLengthCm: quote.singleProductPackageLengthCm,
      singleProductPackageWidthCm: quote.singleProductPackageWidthCm,
      singleProductPackageHeightCm: quote.singleProductPackageHeightCm,
      singleProductPackageWeightKg: quote.singleProductPackageWeightKg,
      
      // FBA (Basic)
      referralFeePct: quote.referralFeePct,
      fbaFeePerUnit: quote.fbaFeePerUnit,
      
      // Supplier Grading (Basic)
      opennessToSsps: quote.opennessToSsps,
      communication: quote.communication,
      sellsOnAmazon: quote.sellsOnAmazon,
      sampling: quote.sampling,
      alibabaTradeAssurance: quote.alibabaTradeAssurance,
      
      // Sales Price
      salesPrice: quote.salesPrice,
      
      // Notes (Basic)
      sspsDiscussed: quote.sspsDiscussed,
      communicationNotes: quote.communicationNotes,
      notes: quote.notes,
    };
    
    // Advanced fields - detailed costs and logistics
    const advanced = {
      // MOQ Options (Advanced)
      moqOptions: quote.moqOptions,
      
      // Legacy MOQ fields
      moqMediumTerm: quote.moqMediumTerm,
      costPerUnitMediumTerm: quote.costPerUnitMediumTerm,
      moqLongTerm: quote.moqLongTerm,
      costPerUnitLongTerm: quote.costPerUnitLongTerm,
      finalCalcTier: quote.finalCalcTier,
      
      // Per-unit Adders (Advanced)
      sspCostPerUnit: quote.sspCostPerUnit,
      labellingCostPerUnit: quote.labellingCostPerUnit,
      packagingCostPerUnit: quote.packagingCostPerUnit,
      packagingPerUnit: quote.packagingPerUnit,
      inspectionCostPerUnit: quote.inspectionCostPerUnit,
      inspectionPerUnit: quote.inspectionPerUnit,
      miscPerUnit: quote.miscPerUnit,
      
      // Production / Terms (Advanced)
      leadTime: quote.leadTime,
      paymentTerms: quote.paymentTerms,
      
      // Carton / Logistics (Advanced)
      unitsPerCarton: quote.unitsPerCarton,
      cartonWeightKg: quote.cartonWeightKg,
      cartonLengthCm: quote.cartonLengthCm,
      cartonWidthCm: quote.cartonWidthCm,
      cartonHeightCm: quote.cartonHeightCm,
      cbmPerCarton: quote.cbmPerCarton,
      totalCbm: quote.totalCbm,
      
      // Freight/Compliance Costs (Advanced)
      freightCostPerUnit: quote.freightCostPerUnit,
      dutyCostPerUnit: quote.dutyCostPerUnit,
      tariffCostPerUnit: quote.tariffCostPerUnit,
      ddpShippingPerUnit: quote.ddpShippingPerUnit,
      incotermsAgreed: quote.incotermsAgreed,
      
      // Sampling (Advanced)
      sampleOrdered: quote.sampleOrdered,
      sampleQualityScore: quote.sampleQualityScore,
      sampleRefundUponOrder: quote.sampleRefundUponOrder,
      sampleNotes: quote.sampleNotes,
      
      // Super Selling Points (SSPs) (Advanced)
      ssps: quote.ssps,
      
      // Derived fields
      referralFee: quote.referralFee,
      totalFbaFeesPerUnit: quote.totalFbaFeesPerUnit,
      landedUnitCost: quote.landedUnitCost,
      profitPerUnit: quote.profitPerUnit,
      roiPct: quote.roiPct,
      marginPct: quote.marginPct,
      totalInvestment: quote.totalInvestment,
      grossProfit: quote.grossProfit,
      supplierGrade: quote.supplierGrade,
      supplierGradeScore: quote.supplierGradeScore,
    };
    
    result[supplierId] = { basic, advanced };
  });
  
  return result;
}

/**
 * Transform supplier quotes object back to array format
 * Input: { [supplierId]: { basic: {...}, advanced: {...} } }
 * Output: SupplierQuoteRow[]
 */
function transformSupplierQuotesToArray(supplierQuotesObj: Record<string, { basic: any; advanced: any }>): any[] {
  if (!supplierQuotesObj || typeof supplierQuotesObj !== 'object') return [];
  
  return Object.entries(supplierQuotesObj).map(([supplierId, data]) => {
    const { basic, advanced } = data;
    return {
      ...basic,
      ...advanced,
      id: basic?.id || supplierId,
    };
  });
}

/**
 * GET /api/sourcing
 * Get sourcing data for a specific product_id (research_product id) or all sourcing products for the user
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    const serverSupabase = getSupabaseClient(token);
    
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');
    
    if (productId) {
      // Get specific sourcing product by product_id (research_product id)
      const { data: sourcingProduct, error } = await serverSupabase
        .from('sourcing_products')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('GET sourcing: Supabase error:', error);
        return NextResponse.json(
          { success: false, error: 'Database error: ' + error.message },
          { status: 500 }
        );
      }
      
      // Transform supplier_quotes back to array format for frontend compatibility
      if (sourcingProduct?.supplier_quotes) {
        sourcingProduct.supplierQuotes = transformSupplierQuotesToArray(sourcingProduct.supplier_quotes);
      }
      
      return NextResponse.json({
        success: true,
        data: sourcingProduct || null
      });
    } else {
      // Get all sourcing products for user
      const { data: sourcingProducts, error } = await serverSupabase
        .from('sourcing_products')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) {
        console.error('GET sourcing: Supabase error:', error);
        return NextResponse.json(
          { success: false, error: 'Database error: ' + error.message },
          { status: 500 }
        );
      }
      
      // Transform supplier_quotes back to array format for each product
      const transformedProducts = (sourcingProducts || []).map(product => ({
        ...product,
        supplierQuotes: product.supplier_quotes 
          ? transformSupplierQuotesToArray(product.supplier_quotes) 
          : []
      }));
      
      return NextResponse.json({
        success: true,
        data: transformedProducts,
        count: transformedProducts.length
      });
    }
    
  } catch (error) {
    console.error('GET sourcing: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch sourcing data' 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sourcing
 * Create a NEW sourcing record for a specific product_id
 * Use PATCH to update an existing record
 * Body: { productId, supplierQuotes?, status?, profitCalculator?, sourcingHub? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }
    
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    const serverSupabase = getSupabaseClient(token);
    
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Check if record already exists
    const { data: existing } = await serverSupabase
      .from('sourcing_products')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', body.productId)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Record already exists. Use PATCH to update.' },
        { status: 409 }
      );
    }

    // Transform supplierQuotes array to object structure
    const supplierQuotesObj = body.supplierQuotes 
      ? transformSupplierQuotesToObject(body.supplierQuotes)
      : {};
    
    // Create new record
    const sourcingData: any = {
      user_id: user.id,
      product_id: body.productId,
      supplier_quotes: supplierQuotesObj,
    };
    
    // Only include optional fields if provided
    if (body.status !== undefined) {
      sourcingData.status = body.status;
    }
    if (body.profitCalculator !== undefined) {
      sourcingData.profit_calculator = body.profitCalculator;
    }
    if (body.sourcingHub !== undefined) {
      sourcingData.sourcing_hub = body.sourcingHub;
    }
    
    console.log('POST sourcing: Creating new sourcing data for product_id:', body.productId);
    
    const { data: sourcingProduct, error } = await serverSupabase
      .from('sourcing_products')
      .insert(sourcingData)
      .select()
      .single();
    
    if (error) {
      console.error('POST sourcing: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    // Transform back for response
    if (sourcingProduct?.supplier_quotes) {
      sourcingProduct.supplierQuotes = transformSupplierQuotesToArray(sourcingProduct.supplier_quotes);
    }
    
    console.log('POST sourcing: Successfully created sourcing data');
    
    return NextResponse.json({
      success: true,
      data: sourcingProduct
    }, { status: 201 });
    
  } catch (error) {
    console.error('POST sourcing: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create sourcing data' 
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sourcing
 * Partially update sourcing data for a specific product_id
 * Body: { productId, status?, supplierQuotes?, profitCalculator?, sourcingHub? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }
    
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    const serverSupabase = getSupabaseClient(token);
    
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Build update object with only provided fields
    const updateData: any = {};
    
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    
    if (body.supplierQuotes !== undefined) {
      updateData.supplier_quotes = transformSupplierQuotesToObject(body.supplierQuotes);
    }
    
    if (body.profitCalculator !== undefined) {
      updateData.profit_calculator = body.profitCalculator;
    }
    
    if (body.sourcingHub !== undefined) {
      updateData.sourcing_hub = body.sourcingHub;
    }
    
    console.log('PATCH sourcing: Updating sourcing data for product_id:', body.productId);
    
    const { data: sourcingProduct, error } = await serverSupabase
      .from('sourcing_products')
      .update(updateData)
      .eq('user_id', user.id)
      .eq('product_id', body.productId)
      .select()
      .single();
    
    if (error) {
      console.error('PATCH sourcing: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    // Transform back for response
    if (sourcingProduct?.supplier_quotes) {
      sourcingProduct.supplierQuotes = transformSupplierQuotesToArray(sourcingProduct.supplier_quotes);
    }
    
    return NextResponse.json({
      success: true,
      data: sourcingProduct
    });
    
  } catch (error) {
    console.error('PATCH sourcing: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update sourcing data' 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sourcing
 * Delete sourcing data for a specific product_id
 * Query params: ?productId=XXXXX
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');
    
    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }
    
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    const serverSupabase = getSupabaseClient(token);
    
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    console.log('DELETE sourcing: Deleting sourcing data for product_id:', productId);
    
    const { error } = await serverSupabase
      .from('sourcing_products')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);
    
    if (error) {
      console.error('DELETE sourcing: Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Database error: ' + error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Sourcing data for product_id ${productId} deleted successfully`
    });
    
  } catch (error) {
    console.error('DELETE sourcing: Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete sourcing data' 
      },
      { status: 500 }
    );
  }
}
