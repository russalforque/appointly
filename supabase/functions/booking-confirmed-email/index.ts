// Emails the customer when their booking is confirmed. Called by the database trigger in
// migration 0027 with { booking_id }. Public endpoint (verify_jwt = false, see
// supabase/config.toml): it trusts nothing but the id — the booking is re-read here, and the
// email only goes out if it is confirmed and hasn't been emailed yet, so calling it again
// (or by hand) can't produce a duplicate or a wrong email.
//
// Sent through Gmail SMTP on port 465 (Edge Functions block outbound 25 and 587).
//
// Secrets: GMAIL_USER         – the Gmail address emails are sent from
//          GMAIL_APP_PASSWORD – a Google App Password for that account (not the normal password)
//          PUBLIC_SITE_URL    – origin used to link to the booking page
// Deno.env.get() takes the secret's NAME; the values live in Supabase secrets, never in code.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_USER = Deno.env.get('GMAIL_USER')!
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!
const SITE_URL = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/$/, '')

const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function formatWhen(iso: string, timeZone: string) {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
  }
  try {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(iso)) + ' UTC'
  }
}

type Booking = {
  id: string
  start_at: string
  public_token: string
  business_id: string
  customers: { name: string; email: string | null } | null
  services: { name: string; duration_minutes: number } | null
  staff: { name: string } | null
  businesses: {
    name: string
    email: string | null
    address: string | null
    city: string | null
    region: string | null
    postal_code: string | null
    phone: string | null
    accent_color: string | null
    show_phone: boolean
    show_address: boolean
    booking_instructions: string | null
    confirmation_message: string | null
  } | null
}

type EmailDetails = { label: string; value: string }[]

function bookingDetails(b: Booking, timezone: string): EmailDetails {
  const rows: EmailDetails = [
    { label: 'Service', value: b.services?.name ?? '' },
    { label: 'When', value: formatWhen(b.start_at, timezone) },
    { label: 'Duration', value: `${b.services?.duration_minutes ?? ''} min` },
    { label: 'With', value: b.staff?.name ?? '' },
  ]
  // The owner's Business Profile switches apply here too: a hidden phone or address stays out.
  const bu = b.businesses
  const where = bu?.show_address
    ? [bu.address, bu.city, bu.region, bu.postal_code].map((p) => p?.trim()).filter(Boolean).join(', ')
    : ''
  if (where) rows.push({ label: 'Where', value: where })
  if (bu?.show_phone && bu.phone) rows.push({ label: 'Phone', value: bu.phone })
  return rows
}

function bookingLink(b: Booking) {
  return SITE_URL ? `${SITE_URL}/booking/${b.public_token}` : ''
}

// A plain-text part alongside the HTML: HTML-only mail is a common spam signal.
function renderText(b: Booking, rows: EmailDetails) {
  const business = b.businesses?.name ?? 'your appointment'
  const link = bookingLink(b)
  return [
    `Hi ${b.customers?.name ?? 'there'},`,
    '',
    `Your appointment with ${business} is confirmed. Here are the details:`,
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    ...(b.businesses?.booking_instructions ? [`Before your visit: ${b.businesses.booking_instructions}`, ''] : []),
    ...(b.businesses?.confirmation_message ? [b.businesses.confirmation_message, ''] : []),
    link ? `View or manage your booking: ${link}` : '',
    '',
    `You're receiving this email because you booked an appointment with ${business} through Appointly.`,
  ].join('\n')
}

function renderEmail(b: Booking, rows: EmailDetails) {
  const accent = b.businesses?.accent_color ?? '#4f46e5'
  const business = esc(b.businesses?.name ?? 'your appointment')
  const link = bookingLink(b)

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Booking confirmed</title></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${accent};padding:24px;color:#fff;font-size:20px;font-weight:600">Your booking is confirmed</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px">Hi ${esc(b.customers?.name ?? 'there')},</p>
<p style="margin:0 0 20px">Your appointment with <strong>${business}</strong> is confirmed. Here are the details:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5">
${rows.map((r) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e5e5;color:#737373;width:90px">${r.label}</td><td style="padding:10px 0;border-bottom:1px solid #e5e5e5">${esc(r.value)}</td></tr>`).join('')}
</table>
${b.businesses?.booking_instructions ? `<p style="margin:20px 0 0;padding:12px 14px;background:#f5f5f5;border-radius:8px;white-space:pre-line"><strong>Before your visit</strong><br>${esc(b.businesses.booking_instructions)}</p>` : ''}
${b.businesses?.confirmation_message ? `<p style="margin:20px 0 0;white-space:pre-line">${esc(b.businesses.confirmation_message)}</p>` : ''}
${link ? `<p style="margin:24px 0 0"><a href="${link}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">View or manage booking</a></p>` : ''}
</td></tr></table>
<p style="color:#a3a3a3;font-size:12px;margin-top:16px;max-width:520px">You're receiving this email because you booked an appointment with ${business} through Appointly.</p>
</td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await req.json().catch(() => null)
  const bookingId: unknown = body?.booking_id
  if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: 'Invalid booking_id' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Atomically claim the booking: only one call can flip sent_at from null, and only while
  // the booking is still confirmed.
  const { data: claimed } = await admin
    .from('bookings')
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .is('confirmation_email_sent_at', null)
    .select(
      'id, start_at, public_token, business_id, customers(name, email), services(name, duration_minutes), staff(name), businesses(name, email, address, city, region, postal_code, phone, accent_color, show_phone, show_address, booking_instructions, confirmation_message)',
    )
    .maybeSingle<Booking>()
  if (!claimed) return json({ ignored: true })

  const release = () => admin.from('bookings').update({ confirmation_email_sent_at: null }).eq('id', bookingId)

  const to = claimed.customers?.email
  if (!to) return json({ ignored: true, reason: 'Customer has no email' })

  const { data: settings } = await admin
    .from('business_settings')
    .select('timezone')
    .eq('business_id', claimed.business_id)
    .maybeSingle()

  const businessName = claimed.businesses?.name ?? 'Appointly'
  const rows = bookingDetails(claimed, settings?.timezone ?? 'UTC')
  try {
    await mailer.sendMail({
      // Gmail only sends as the signed-in address, so the business goes in the display name and
      // replies go to the business's own email when it has one. "via Appointly" keeps the name
      // honest about the sending account, which spam filters weigh.
      from: { name: `${businessName} via Appointly`, address: GMAIL_USER },
      replyTo: claimed.businesses?.email ?? undefined,
      to,
      subject: `Booking confirmed – ${businessName}`,
      text: renderText(claimed, rows),
      html: renderEmail(claimed, rows),
    })
  } catch (err) {
    // Un-claim so a later retry can send it.
    await release()
    console.error('Gmail SMTP error', err)
    return json({ error: 'Email send failed' }, 502)
  }
  return json({ sent: true })
})
