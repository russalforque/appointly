// Xendit invoice callback receiver. Public endpoint (verify_jwt = false, see
// supabase/config.toml) — authenticity instead comes from the x-callback-token header,
// which Xendit sends with the verification token from the dashboard. This is the only
// place a subscription is ever marked active; the frontend success page never does this.
//
// Secrets: XENDIT_CALLBACK_TOKEN – the webhook verification token from the Xendit dashboard.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CALLBACK_TOKEN = Deno.env.get('XENDIT_CALLBACK_TOKEN')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Length-independent, constant-time string compare, so the token can't be guessed by timing. */
function tokenMatches(received: string | null): boolean {
  if (!received) return false
  const a = new TextEncoder().encode(received)
  const b = new TextEncoder().encode(CALLBACK_TOKEN)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

const PERIOD_DAYS: Record<string, number> = { month: 30, year: 365 }

/** 'sub_<businessId>_<timestamp>' — the external_id built by xendit-checkout. */
function businessIdFromExternalId(externalId: unknown): string | null {
  if (typeof externalId !== 'string') return null
  const match = externalId.match(/^sub_([0-9a-f-]{36})_\d+$/i)
  return match ? match[1] : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!tokenMatches(req.headers.get('x-callback-token'))) return json({ error: 'Invalid callback token' }, 401)

  const event = await req.json().catch(() => null)
  if (!event) return json({ error: 'Invalid payload' }, 400)

  const status: string = event?.status ?? ''
  const invoiceId: string | undefined = event?.id
  if (!invoiceId) return json({ error: 'Missing invoice id' }, 400)
  if (status !== 'PAID' && status !== 'EXPIRED') return json({ ignored: true })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Find the row this invoice belongs to. checkout_ref is written before the redirect, so
  // it is the primary match; external_id is the fallback if that write never landed.
  const businessId = businessIdFromExternalId(event?.external_id)
  const filter = businessId ? `checkout_ref.eq.${invoiceId},business_id.eq.${businessId}` : `checkout_ref.eq.${invoiceId}`
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, plan_id, status, trial_end, checkout_ref')
    .or(filter)
    .limit(1)
    .maybeSingle()
  if (!sub) return json({ error: 'No subscription for this invoice' }, 404)

  if (status === 'EXPIRED') {
    // An abandoned checkout must not leave the business sitting in 'pending', which still
    // grants access. Fall back to the trial if it has time left, otherwise lock it.
    if (sub.status !== 'pending') return json({ ignored: true })
    const trialLeft = sub.trial_end && new Date(sub.trial_end).getTime() > Date.now()
    await admin
      .from('subscriptions')
      .update({ status: trialLeft ? 'trialing' : 'past_due', checkout_ref: null })
      .eq('id', sub.id)
    return json({ received: true })
  }

  // Idempotent: a replayed PAID callback for an invoice we already activated must not
  // shift the billing period forward again.
  if (sub.status === 'active' && sub.checkout_ref === invoiceId) return json({ ignored: true })

  const { data: plan } = await admin.from('plans').select('interval').eq('id', sub.plan_id ?? '').maybeSingle()
  const days = PERIOD_DAYS[plan?.interval ?? 'month'] ?? 30
  const now = new Date()
  const periodEnd = new Date(now.getTime() + days * 86400000)

  const { error } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      provider: 'xendit',
      checkout_ref: invoiceId,
      payment_ref: event?.payment_id ?? event?.payment_channel ?? null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq('id', sub.id)
  if (error) return json({ error: 'Could not update subscription' }, 500)

  return json({ received: true })
})
