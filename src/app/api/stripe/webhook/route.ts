import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

// Disable body parsing for Stripe webhooks (required for signature verification)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events to update user subscription status
 * 
 * Events handled:
 * - customer.subscription.created: New subscription (TRIALING or ACTIVE)
 * - customer.subscription.updated: Subscription changes (status, plan, etc.)
 * - customer.subscription.deleted: Subscription canceled (CANCELED)
 */
export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    console.error('POST stripe/webhook: STRIPE_SECRET_KEY is not configured');
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 500 }
    );
  }

  if (!webhookSecret) {
    console.error('POST stripe/webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook secret is not configured' },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-11-17.clover',
  });

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('POST stripe/webhook: Missing stripe-signature header');
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('POST stripe/webhook: Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription, stripe);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription, stripe);
        break;
      }
      default:
        console.log(`POST stripe/webhook: Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('POST stripe/webhook: Error processing webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription, stripe?: Stripe) {
  // Try to get supabase_user_id from subscription metadata first
  let supabaseUserId = subscription.metadata?.supabase_user_id;

  // If not found in subscription metadata, try to get it from customer metadata
  if (!supabaseUserId && stripe) {
    try {
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      
      const customer = await stripe.customers.retrieve(customerId);
      
      // Check if customer is not deleted and has metadata
      if (customer && !('deleted' in customer && customer.deleted) && 'metadata' in customer) {
        const customerMetadata = customer.metadata;
        if (customerMetadata?.supabase_user_id) {
          supabaseUserId = customerMetadata.supabase_user_id;
          
          // Also update subscription metadata with the user ID for future webhooks
          await stripe.subscriptions.update(subscription.id, {
            metadata: {
              ...subscription.metadata,
              supabase_user_id: supabaseUserId,
            },
          });
          
          console.log('POST stripe/webhook: Retrieved supabase_user_id from customer metadata and updated subscription', {
            userId: supabaseUserId,
            subscriptionId: subscription.id,
          });
        }
      }
    } catch (error: any) {
      console.error('POST stripe/webhook: Error retrieving customer:', error);
    }
  }

  if (!supabaseUserId) {
    console.error('POST stripe/webhook: Cannot find supabase_user_id in subscription or customer metadata', {
      subscriptionId: subscription.id,
      customerId: typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer?.id,
      subscriptionMetadata: subscription.metadata,
    });
    throw new Error('Missing supabase_user_id in subscription and customer metadata');
  }

  // Determine subscription status
  let subscriptionStatus: 'ACTIVE' | 'TRIALING' | 'CANCELED';
  
  if (subscription.status === 'active' && subscription.trial_end && subscription.trial_end > Math.floor(Date.now() / 1000)) {
    subscriptionStatus = 'TRIALING';
  } else if (subscription.status === 'active') {
    subscriptionStatus = 'ACTIVE';
  } else if (subscription.status === 'trialing') {
    subscriptionStatus = 'TRIALING';
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due') {
    subscriptionStatus = 'CANCELED';
  } else {
    // For other statuses like 'incomplete', 'incomplete_expired', etc., set to CANCELED
    subscriptionStatus = 'CANCELED';
  }

  // Determine subscription type (MONTHLY or YEARLY)
  let subscriptionType: 'MONTHLY' | 'YEARLY' | null = null;

  if (subscription.items.data.length > 0) {
    const price = subscription.items.data[0].price;
    if (price.recurring) {
      const interval = price.recurring.interval;
      if (interval === 'month') {
        subscriptionType = 'MONTHLY';
      } else if (interval === 'year') {
        subscriptionType = 'YEARLY';
      }
    }
  }

  if (!subscriptionType) {
    console.warn('POST stripe/webhook: Could not determine subscription type', {
      subscriptionId: subscription.id,
      items: subscription.items.data,
    });
  }

  // Update profile (upsert in case profile doesn't exist yet)
  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: supabaseUserId,
      subscription_status: subscriptionStatus,
      subscription_type: subscriptionType,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

  if (error) {
    console.error('POST stripe/webhook: Failed to update profile:', error);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  console.log('POST stripe/webhook: Successfully updated profile subscription', {
    userId: supabaseUserId,
    subscriptionId: subscription.id,
    status: subscriptionStatus,
    type: subscriptionType,
  });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription, stripe?: Stripe) {
  // Try to get supabase_user_id from subscription metadata first
  let supabaseUserId = subscription.metadata?.supabase_user_id;

  // If not found in subscription metadata, try to get it from customer metadata
  if (!supabaseUserId && stripe) {
    try {
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      
      const customer = await stripe.customers.retrieve(customerId);
      
      // Check if customer is not deleted and has metadata
      if (customer && !('deleted' in customer && customer.deleted) && 'metadata' in customer) {
        const customerMetadata = customer.metadata;
        if (customerMetadata?.supabase_user_id) {
          supabaseUserId = customerMetadata.supabase_user_id;
          console.log('POST stripe/webhook: Retrieved supabase_user_id from customer metadata for deleted subscription', {
            userId: supabaseUserId,
            subscriptionId: subscription.id,
          });
        }
      }
    } catch (error: any) {
      console.error('POST stripe/webhook: Error retrieving customer for deleted subscription:', error);
    }
  }

  if (!supabaseUserId) {
    console.error('POST stripe/webhook: Cannot find supabase_user_id in deleted subscription or customer metadata', {
      subscriptionId: subscription.id,
      customerId: typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer?.id,
      subscriptionMetadata: subscription.metadata,
    });
    throw new Error('Missing supabase_user_id in subscription and customer metadata');
  }

  // Update profile to CANCELED status
  // Keep subscription_type if it exists (don't update it)
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_type')
    .eq('id', supabaseUserId)
    .single();

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: supabaseUserId,
      subscription_status: 'CANCELED',
      subscription_type: existingProfile?.subscription_type || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

  if (error) {
    console.error('POST stripe/webhook: Failed to update profile on deletion:', error);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  console.log('POST stripe/webhook: Successfully marked subscription as CANCELED', {
    userId: supabaseUserId,
    subscriptionId: subscription.id,
  });
}

