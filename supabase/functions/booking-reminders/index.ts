// Emails customers a reminder before their confirmed appointment (Business plan). Called every 15
// minutes by the pg_cron job in migration 0029, with an empty body. Public endpoint
// (verify_jwt = false, see supabase/config.toml): it takes no input at all. Which bookings are due
// is decided by claim_due_booking_reminders() in the database — confirmed, inside the business's
// reminder window, on a plan that includes reminders, not yet reminded — and the claim marks them,
// so extra or overlapping calls can never send a reminder twice.
//
// Same Gmail SMTP setup and secrets as booking-confirmed-email.
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
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
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
  } | null
}

function details(b: Booking, timezone: string) {
  const rows = [
    { label: 'Service', value: b.services?.name ?? '' },
    { label: 'When', value: formatWhen(b.start_at, timezone) },
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

function renderText(b: Booking, rows: { label: string; value: string }[], link: string) {
  const business = b.businesses?.name ?? 'your appointment'
  return [
    `Hi ${b.customers?.name ?? 'there'},`,
    '',
    `This is a reminder of your upcoming appointment with ${business}:`,
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    ...(b.businesses?.booking_instructions ? [`Before your visit: ${b.businesses.booking_instructions}`, ''] : []),
    link ? `Need to cancel or check the details? ${link}` : '',
    '',
    `You're receiving this email because you booked an appointment with ${business} through Appointly.`,
  ].join('\n')
}

function renderEmail(b: Booking, rows: { label: string; value: string }[], link: string) {
  const accent = b.businesses?.accent_color ?? '#4f46e5'
  const business = esc(b.businesses?.name ?? 'your appointment')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Appointment reminder</title></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${accent};padding:24px;color:#fff;font-size:20px;font-weight:600">See you soon</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px">Hi ${esc(b.customers?.name ?? 'there')},</p>
<p style="margin:0 0 20px">This is a reminder of your upcoming appointment with <strong>${business}</strong>:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5">
${rows.map((r) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e5e5;color:#737373;width:90px">${r.label}</td><td style="padding:10px 0;border-bottom:1px solid #e5e5e5">${esc(r.value)}</td></tr>`).join('')}
</table>
${b.businesses?.booking_instructions ? `<p style="margin:20px 0 0;padding:12px 14px;background:#f5f5f5;border-radius:8px;white-space:pre-line"><strong>Before your visit</strong><br>${esc(b.businesses.booking_instructions)}</p>` : ''}
${link ? `<p style="margin:24px 0 0"><a href="${link}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">View or manage booking</a></p>` : ''}
</td></tr></table>
<p style="color:#a3a3a3;font-size:12px;margin-top:16px;max-width:520px">You're receiving this email because you booked an appointment with ${business} through Appointly.</p>
</td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: ids, error } = await admin.rpc('claim_due_booking_reminders', { p_limit: 50 })
  if (error) {
    console.error('claim_due_booking_reminders failed', error)
    return json({ error: 'Could not load reminders' }, 500)
  }
  const claimed = (ids ?? []) as string[]
  if (!claimed.length) return json({ sent: 0 })

  const { data: bookings } = await admin
    .from('bookings')
    .select(
      'id, start_at, public_token, business_id, customers(name, email), services(name, duration_minutes), staff(name), businesses(name, email, address, city, region, postal_code, phone, accent_color, show_phone, show_address, booking_instructions)',
    )
    .in('id', claimed)
    .returns<Booking[]>()

  const businessIds = [...new Set((bookings ?? []).map((b) => b.business_id))]
  const { data: settings } = await admin.from('business_settings').select('business_id, timezone').in('business_id', businessIds)
  const tzOf = new Map((settings ?? []).map((s: { business_id: string; timezone: string }) => [s.business_id, s.timezone]))

  let sent = 0
  const failed: string[] = []
  for (const b of bookings ?? []) {
    const to = b.customers?.email
    if (!to) continue
    const businessName = b.businesses?.name ?? 'Appointly'
    const rows = details(b, tzOf.get(b.business_id) ?? 'UTC')
    const link = SITE_URL ? `${SITE_URL}/booking/${b.public_token}` : ''
    try {
      await mailer.sendMail({
        from: { name: `${businessName} via Appointly`, address: GMAIL_USER },
        replyTo: b.businesses?.email ?? undefined,
        to,
        subject: `Reminder: your appointment with ${businessName}`,
        text: renderText(b, rows, link),
        html: renderEmail(b, rows, link),
      })
      sent++
    } catch (err) {
      console.error('Gmail SMTP error', b.id, err)
      failed.push(b.id)
    }
  }

  // Un-claim failures so the next run retries them (while they are still upcoming).
  if (failed.length) await admin.from('bookings').update({ reminder_sent_at: null }).in('id', failed)
  return json({ sent, failed: failed.length })
})
