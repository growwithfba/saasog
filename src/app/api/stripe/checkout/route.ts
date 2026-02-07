import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

/**
 * POST /api/stripe/checkout
 * Creates a Stripe checkout session with a 7-day free trial (only for first-time subscribers)
 * 
 * Body:
 * - productId: string - The Stripe product ID
 * - userId: string - The Supabase user ID
 * - userEmail: string - The user's email address
 */
export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.error('POST stripe/checkout: STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Stripe is not configured. Please contact support.' 
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const body = await request.json();
    const { productId, userId, userEmail } = body;

    if (!productId || !userId || !userEmail) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: productId, userId, and userEmail are required' 
        },
        { status: 400 }
      );
    }

    // Fetch the product to get its default price
    const product = await stripe.products.retrieve(productId);
    
    if (!product || !product.active) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Product not found or inactive' 
        },
        { status: 404 }
      );
    }

    // Get the default price for this product
    let priceId: string | null = null;
    
    // Handle default_price - it can be a string (ID), an expanded Price object, or null
    if (product.default_price) {
      if (typeof product.default_price === 'string') {
        priceId = product.default_price;
      } else if (typeof product.default_price === 'object' && 'id' in product.default_price) {
        priceId = product.default_price.id;
      }
    }
    
    // If no default price found, fetch the first active price
    if (!priceId) {
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 1,
      });
      
      if (prices.data.length === 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'No active price found for this product' 
          },
          { status: 404 }
        );
      }
      
      priceId = prices.data[0].id;
    }

    // Check if user has already used their trial period
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('has_used_trial')
      .eq('id', userId)
      .single();

    const hasUsedTrial = profile?.has_used_trial ?? false;

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('POST stripe/checkout: Error checking trial status:', profileError);
      // Continue anyway - default to no trial to be safe
    }

    console.log('POST stripe/checkout: Trial eligibility check', {
      userId,
      hasUsedTrial,
      willOfferTrial: !hasUsedTrial,
    });

    // Get or create Stripe customer
    let customer;
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (customers.data.length > 0) {
      customer = customers.data[0];
      // Update customer metadata if supabase_user_id is not present
      if (!customer.metadata?.supabase_user_id) {
        customer = await stripe.customers.update(customer.id, {
          metadata: {
            ...customer.metadata,
            supabase_user_id: userId,
          },
        });
        console.log('POST stripe/checkout: Updated existing customer with supabase_user_id', {
          customerId: customer.id,
          userId,
        });
      }
    } else {
      customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          supabase_user_id: userId,
        },
      });
      console.log('POST stripe/checkout: Created new customer with supabase_user_id', {
        customerId: customer.id,
        userId,
      });
    }

    // Build subscription_data - only include trial if user hasn't used it before
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        supabase_user_id: userId,
        product_id: productId,
      },
    };

    // Only add trial_period_days if user has never used a trial
    if (!hasUsedTrial) {
      subscriptionData.trial_period_days = 7;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: subscriptionData,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/subscription?canceled=true`,
      metadata: {
        supabase_user_id: userId,
        product_id: productId,
      },
      allow_promotion_codes: true,
    });

    console.log('POST stripe/checkout: Created checkout session', { 
      sessionId: session.id, 
      productId, 
      userId 
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    }, { status: 200 });
    
  } catch (error) {
    console.error('POST stripe/checkout: Unexpected error:', error);
    
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Stripe error: ${error.message}`,
          type: error.type
        },
        { status: error.statusCode || 500 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create checkout session' 
      },
      { status: 500 }
    );
  }
}

