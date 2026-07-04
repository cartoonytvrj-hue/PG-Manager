import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Money ───────────────────────────────────────────────────────────────────
export function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatMonth(date: string | Date) {
  return format(new Date(date), 'MMMM yyyy')
}

/**
 * Returns the last valid date-of-month for a given year/month, clamped.
 * e.g. getClampedDate(2024, 1 /*Feb*\/, 31) → Feb 29, 2024 (not March 2/3)
 */
function getClampedDate(year: number, month: number, day: number): Date {
  // Day 0 of "next month" = last day of "this month"
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(day, lastDayOfMonth)
  return new Date(year, month, safeDay)
}

/**
 * Compute the current cycle's due date for a tenant.
 * Rule: due date = same day-of-month as joining date, for the current month.
 * If that date hasn't arrived yet this month, use last month's due date instead.
 * Correctly handles months with fewer days (e.g. joined on the 31st — due date
 * becomes the 28th/29th/30th in shorter months, never rolls into the next month).
 */
export function computeDueDate(joiningDate: string, today = new Date()): Date {
  const joined = new Date(joiningDate)
  const dueDay = joined.getDate()

  // Normalize "today" to midnight so day-based comparisons don't get thrown off by time-of-day
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  let due = getClampedDate(todayMidnight.getFullYear(), todayMidnight.getMonth(), dueDay)

  // If this month's due date is still upcoming, the *current* pending cycle is last month's
  if (due > todayMidnight) {
    const prevMonthDate = new Date(todayMidnight.getFullYear(), todayMidnight.getMonth() - 1, 1)
    due = getClampedDate(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), dueDay)
  }

  // Never show a due date before the tenant actually joined
  const joinedMidnight = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate())
  if (due < joinedMidnight) due = joinedMidnight

  return due
}

export function getOverdueDays(joiningDate: string, today = new Date()): number {
  const due = computeDueDate(joiningDate, today)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, differenceInDays(todayMidnight, due))
}

// ─── QR slug generator ────────────────────────────────────────────────────────
export function generateSlug(pgName: string) {
  return pgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)
}

// ─── WhatsApp deep-link ───────────────────────────────────────────────────────
export function whatsappLink(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, '')
  const num = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}

export function rentReminderMsg(tenantName: string, amount: number, pgName: string) {
  return `Hi ${tenantName} 👋,\n\nThis is a friendly reminder that your rent of ${formatINR(amount)} is due for ${pgName}.\n\nPlease make the payment at your earliest convenience.\n\nThank you! 🙏`
}

// ─── UPI payment link (free — standard UPI deep-link, no gateway needed) ────────
// This generates the same kind of link any UPI QR code encodes. Scanning it
// opens the tenant's own UPI app (GPay/PhonePe/Paytm/etc.) pre-filled with the
// amount, and money goes straight to the owner's bank account — this app never
// touches the payment itself, so there's no transaction fee or gateway account.
export function upiPaymentLink(upiId: string, payeeName: string, amount: number, note: string) {
  const params = new URLSearchParams({
    pa: upiId,                          // payee UPI address
    pn: payeeName,                      // payee name
    am: amount.toFixed(2),              // amount
    cu: 'INR',
    tn: note,                           // transaction note
  })
  return `upi://pay?${params.toString()}`
}

// ─── Occupancy calc ───────────────────────────────────────────────────────────
export function occupancyPercent(occupied: number, total: number) {
  if (total === 0) return 0
  return Math.round((occupied / total) * 100)
}
