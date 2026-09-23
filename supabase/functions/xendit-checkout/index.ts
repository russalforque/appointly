// Creates a Xendit Invoice for the caller's business and returns the hosted checkout URL.
// Runs server-side only: the Xendit secret key never reaches the browser. Requires the
// caller's Supabase JWT and re-derives business + plan from the database rather than
// trusting anything the client sends beyond a plan id.
//
// Secrets (supabase secrets set ...):
//   XENDIT_SECRET_KEY      – Xendit API secret key (xnd_development_… / xnd_production_…)
//   PUBLIC_SITE_URL        – origin used to build the redirect URLs
//   XENDIT_PAYMENT_METHODS – optional, comma-separated (e.g. CREDIT_CARD,GCASH,PAYMAYA).
//                            Omit it to let Xendit show every channel activated on the account.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY')!
const SITE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? ''
const PAYMENT_METHODS = (Deno.env.get('XENDIT_PAYMENT_METHODS') ?? '')
  .split(',')
  .map((m) => m.trim().toUpperCase())
  .filter(Boolean)

// How long the hosted invoice stays payable before Xendit expires it.
const INVOICE_DURATION_SECONDS = 86400

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  const { planId } = await req.json().catch(() => ({}))
  if (typeof planId !== 'string' || !planId) return json({ error: 'planId is required' }, 400)

  // Verifies the caller's JWT using their own token (never trust a user_id from the body).
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)
  const user = userData.user

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // MVP: one business per owning user, same assumption the dashboard uses.
  const { data: membership } = await admin
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle()
  if (!membership) return json({ error: 'No business found for this account' }, 404)

  // The price is only ever read from the trusted plans table, never from the client.
  const { data: plan } = await admin.from('plans').select('*').eq('id', planId).eq('is_active', true).maybeSingle()
  if (!plan) return json({ error: 'Unknown plan' }, 400)

  // Plans are stored in cents; Xendit bills PHP in whole pesos, so a plan priced at a
  // fraction of a peso cannot be charged accurately and is a configuration error.
  if (plan.price_cents % 100 !== 0) return json({ error: 'Plan price must be a whole amount' }, 500)
  const amount = plan.price_cents / 100

  // Unique per attempt, and carries the business id so the webhook can recover the row
  // even if the invoice id was never written below.
  const externalId = `sub_${membership.business_id}_${Date.now()}`

  const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${XENDIT_SECRET_KEY}:`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_id: externalId,
      amount,
      currency: plan.currency,
      description: `${plan.name} subscription`,
      payer_email: user.email ?? undefined,
      invoice_duration: INVOICE_DURATION_SECONDS,
      success_redirect_url: `${SITE_URL}/payment/success`,
      failure_redirect_url: `${SITE_URL}/payment/cancelled`,
      ...(PAYMENT_METHODS.length ? { payment_methods: PAYMENT_METHODS } : {}),
      items: [{ name: `${plan.name} plan`, price: amount, quantity: 1 }],
      metadata: { user_id: user.id, business_id: membership.business_id, plan_id: plan.id },
    }),
  })
  const invoice = await xenditRes.json()
  if (!xenditRes.ok) return json({ error: invoice?.message ?? 'Xendit checkout failed' }, 502)

  const checkoutId: string = invoice.id
  const checkoutUrl: string = invoice.invoice_url

  // plan_id is recorded here so the webhook can price the period without trusting the
  // callback payload's metadata, which Xendit only echoes on some channels.
  const { error: upErr } = await admin
    .from('subscriptions')
    .update({ plan_id: plan.id, status: 'pending', provider: 'xendit', checkout_ref: checkoutId, payment_ref: null })
    .eq('business_id', membership.business_id)
  if (upErr) return json({ error: 'Could not record checkout' }, 500)

  return json({ checkoutUrl })
})
