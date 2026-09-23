// Manual GoTyme Bank / QR Ph subscription payments.
//
// Every state change goes through a security-definer RPC: the browser only ever sends a plan id,
// the customer's own transaction reference, a date, a receipt path and notes. The amount, the
// status, the business and the verifying admin are all decided in the database.
import { supabase } from './supabase'
import { friendlyError, unwrap } from './db'
import type { AdminPayment, PaymentCounts, PaymentSettings, SubscriptionPayment } from './types'

export const PROOF_BUCKET = 'payment-proofs'
export const MAX_PROOF_BYTES = 5 * 1024 * 1024
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PROOF_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp']

/** Extension *and* MIME must both be allowed; the original filename is never reused. */
export function validateProof(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext)) return 'Upload a JPG, PNG or WebP image.'
  if (!PROOF_MIME_TYPES.includes(file.type)) return 'That file is not a JPG, PNG or WebP image.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_PROOF_BYTES) return 'The receipt must be smaller than 5MB.'
  return null
}

export const fetchPaymentSettings = () =>
  unwrap<PaymentSettings | null>(supabase.from('payment_settings').select('*').eq('id', 'gotyme').maybeSingle())

/** Submitted payments only — drafts are reference reservations, not history. */
export const fetchPayments = (businessId: string) =>
  unwrap<SubscriptionPayment[]>(
    supabase
      .from('subscription_payments')
      .select('*')
      .eq('business_id', businessId)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false }),
  )

/** Reserves the payment record and its reference so the customer can quote it in the transfer. */
export async function startPayment(businessId: string, planId: string): Promise<SubscriptionPayment> {
  const { data, error } = await supabase.rpc('start_subscription_payment', {
    p_business_id: businessId,
    p_plan_id: planId,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data as SubscriptionPayment
}

/** Uploads the receipt to payment-proofs/<business>/<payment>/<uuid>.<ext> and returns the path. */
export async function uploadProof(businessId: string, paymentId: string, file: File): Promise<string> {
  const path = `${businessId}/${paymentId}/${crypto.randomUUID()}.${EXT_BY_MIME[file.type]}`
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(friendlyError(error.message))
  return path
}

/** Short-lived link to a receipt; the bucket itself is private. */
export async function proofUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, seconds)
  if (error || !data) throw new Error(friendlyError(error?.message ?? 'Could not open the receipt'))
  return data.signedUrl
}

export interface PaymentSubmission {
  paymentId: string
  transactionRef: string
  paymentDate: string
  proofPath: string
  notes: string | null
  /** The subscription terms checkbox. The database refuses the submission without it. */
  termsAccepted: boolean
  /** Which revision of the terms was on screen, from LEGAL_UPDATED. */
  termsVersion: string
}

/** Amount, plan and business all come from the reserved record — none of them travel from here. */
export async function submitPayment(s: PaymentSubmission): Promise<SubscriptionPayment> {
  const { data, error } = await supabase.rpc('submit_subscription_payment', {
    p_payment_id: s.paymentId,
    p_transaction_ref: s.transactionRef,
    p_payment_date: s.paymentDate,
    p_proof_path: s.proofPath,
    p_notes: s.notes,
    p_terms_accepted: s.termsAccepted,
    p_terms_version: s.termsVersion,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data as SubscriptionPayment
}

/** Client-side warning only — the database is what actually blocks a real duplicate. */
export function findPossibleDuplicate(payments: SubscriptionPayment[], transactionRef: string) {
  const ref = transactionRef.trim().toLowerCase()
  if (ref.length < 4) return null
  return payments.find((p) => p.customer_transaction_reference?.toLowerCase() === ref) ?? null
}

// --- Platform admin ---------------------------------------------------------

export async function adminListPayments(status?: string): Promise<AdminPayment[]> {
  const { data, error } = await supabase.rpc('admin_list_subscription_payments', { p_status: status ?? null })
  if (error) throw new Error(friendlyError(error.message))
  return (data ?? []) as AdminPayment[]
}

export async function adminPaymentCounts(): Promise<PaymentCounts> {
  const { data, error } = await supabase.rpc('admin_payment_counts')
  if (error) throw new Error(friendlyError(error.message))
  const row = (data as PaymentCounts[] | null)?.[0]
  return row ?? { pending: 0, approved: 0, rejected: 0, expired: 0, total: 0 }
}

export async function approvePayment(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_subscription_payment', { p_payment_id: id })
  if (error) throw new Error(friendlyError(error.message))
}

export async function rejectPayment(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_subscription_payment', { p_payment_id: id, p_reason: reason })
  if (error) throw new Error(friendlyError(error.message))
}

export async function savePaymentSettings(s: {
  accountName: string
  accountNumber: string
  qrImageUrl: string | null
  instructions: string
  isActive: boolean
}): Promise<PaymentSettings> {
  const { data, error } = await supabase.rpc('update_payment_settings', {
    p_account_name: s.accountName,
    p_account_number: s.accountNumber,
    p_qr_image_url: s.qrImageUrl,
    p_instructions: s.instructions,
    p_is_active: s.isActive,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data as PaymentSettings
}

/** QR image lives in a public bucket so it renders without a signed request on every view. */
export async function uploadQrImage(file: File): Promise<string> {
  const path = `gotyme/${crypto.randomUUID()}.${EXT_BY_MIME[file.type] ?? 'png'}`
  const { error } = await supabase.storage.from('payment-assets').upload(path, file, { contentType: file.type })
  if (error) throw new Error(friendlyError(error.message))
  return supabase.storage.from('payment-assets').getPublicUrl(path).data.publicUrl
}
