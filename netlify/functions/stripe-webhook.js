// Netlify serverless function — handles Stripe payment webhooks
// Runs server-side only; secret keys never touch the browser.
//
// Environment variables to set in Netlify dashboard → Site settings → Env vars:
//   STRIPE_SECRET_KEY        → from stripe.com/dashboard/apikeys
//   STRIPE_WEBHOOK_SECRET    → from stripe.com/dashboard/webhooks (after creating endpoint)
//   SUPABASE_URL             → your project URL from supabase.com
//   SUPABASE_SERVICE_ROLE_KEY → from supabase.com → Settings → API (secret, never in client code)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle successful payment events
  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'payment_link.completed'
  ) {
    const session = stripeEvent.data.object;
    const quoteId = session.metadata?.quote_id || null;
    const customerEmail = session.customer_email || session.customer_details?.email || null;

    try {
      // Find user_id by email if possible
      let userId = null;
      if (customerEmail) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', (
            await supabase.auth.admin.listUsers()
          ).data?.users?.find(u => u.email === customerEmail)?.id || '')
          .maybeSingle();
        if (profiles) userId = profiles.id;
      }

      // Create order record
      const { error: orderErr } = await supabase.from('orders').insert({
        user_id:           userId,
        quote_id:          quoteId,
        stripe_session_id: session.id,
        amount_paid:       (session.amount_total || 0) / 100,
        status:            'paid',
        customer_email:    customerEmail,
      });
      if (orderErr) console.error('Order insert error:', orderErr);

      // Mark quote as paid
      if (quoteId) {
        const { error: quoteErr } = await supabase
          .from('quotes')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', quoteId);
        if (quoteErr) console.error('Quote update error:', quoteErr);
      }

      console.log('Payment recorded for session:', session.id);
    } catch (err) {
      console.error('Database error:', err);
      return { statusCode: 500, body: 'Database error' };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
