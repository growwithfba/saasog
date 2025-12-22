import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * GET /api/stripe/products
 * Fetches the two subscription products (monthly and annual) and their prices from Stripe
 */
export async function GET(request: NextRequest) {
  try {
    // Check if Stripe secret key is configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.error('GET stripe/products: STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Stripe is not configured. Please contact support.' 
        },
        { status: 500 }
      );
    }

    // Initialize Stripe client
    const stripe = new Stripe(stripeSecretKey);

    // Lookup keys for monthly and annual subscriptions
    const MONTHLY_LOOKUP_KEY = 'grow_with_fba_ai_monthly_subscription';
    const ANNUAL_LOOKUP_KEY = 'grow_with_fba_ai_yearly_membership';

    console.log('GET stripe/products: Fetching subscription products from Stripe by lookup keys', { 
      monthly: MONTHLY_LOOKUP_KEY, 
      annual: ANNUAL_LOOKUP_KEY 
    });

    // Fetch prices by lookup keys
    const [monthlyPriceData, annualPriceData] = await Promise.all([
      stripe.prices.list({
        lookup_keys: [MONTHLY_LOOKUP_KEY],
        active: true,
        limit: 1,
      }),
      stripe.prices.list({
        lookup_keys: [ANNUAL_LOOKUP_KEY],
        active: true,
        limit: 1,
      }),
    ]);

    // Check if prices were found
    if (monthlyPriceData.data.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Price with lookup key '${MONTHLY_LOOKUP_KEY}' not found` 
        },
        { status: 404 }
      );
    }

    if (annualPriceData.data.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Price with lookup key '${ANNUAL_LOOKUP_KEY}' not found` 
        },
        { status: 404 }
      );
    }

    const monthlyPrice = monthlyPriceData.data[0];
    const annualPrice = annualPriceData.data[0];

    // Get product IDs from prices
    const monthlyProductId = typeof monthlyPrice.product === 'string' 
      ? monthlyPrice.product 
      : monthlyPrice.product.id;
    const annualProductId = typeof annualPrice.product === 'string' 
      ? annualPrice.product 
      : annualPrice.product.id;

    // Fetch the products
    const [monthlyProduct, annualProduct] = await Promise.all([
      stripe.products.retrieve(monthlyProductId),
      stripe.products.retrieve(annualProductId),
    ]);

    // Fetch all prices for both products
    const [monthlyPrices, annualPrices] = await Promise.all([
      stripe.prices.list({
        product: monthlyProductId,
        active: true,
        limit: 100,
      }),
      stripe.prices.list({
        product: annualProductId,
        active: true,
        limit: 100,
      }),
    ]);

    // Helper function to format product with prices
    const formatProduct = (product: Stripe.Product, prices: Stripe.Price[]) => {
      // Find the default price (or first price if no default)
      const defaultPrice = prices.find(price => price.id === product.default_price) || prices[0];

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
        metadata: product.metadata,
        active: product.active,
        created: product.created,
        default_price: defaultPrice ? {
          id: defaultPrice.id,
          unit_amount: defaultPrice.unit_amount,
          currency: defaultPrice.currency,
          lookup_key: defaultPrice.lookup_key,
          recurring: defaultPrice.recurring ? {
            interval: defaultPrice.recurring.interval,
            interval_count: defaultPrice.recurring.interval_count,
            trial_period_days: defaultPrice.recurring.trial_period_days,
          } : null,
          type: defaultPrice.type,
        } : null,
        prices: prices.map(price => ({
          id: price.id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          lookup_key: price.lookup_key,
          recurring: price.recurring ? {
            interval: price.recurring.interval,
            interval_count: price.recurring.interval_count,
            trial_period_days: price.recurring.trial_period_days,
          } : null,
          type: price.type,
        })),
      };
    };

    // Format both products
    const productsWithPrices = [
      formatProduct(monthlyProduct, monthlyPrices.data),
      formatProduct(annualProduct, annualPrices.data),
    ];

    console.log(`GET stripe/products: Successfully retrieved ${productsWithPrices.length} products`);

    return NextResponse.json({
      success: true,
      data: productsWithPrices,
      count: productsWithPrices.length
    }, { status: 200 });
    
  } catch (error) {
    console.error('GET stripe/products: Unexpected error:', error);
    
    // Handle Stripe-specific errors
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
        error: error instanceof Error ? error.message : 'Failed to fetch Stripe products' 
      },
      { status: 500 }
    );
  }
}

