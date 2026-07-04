import { createClient } from '@/lib/supabase/client'
import type {
  AddRoomInput, AddTenantInput, RecordPaymentInput,
  AddExpenseInput, AddComplaintInput, Property, Tenant
} from '@/types'
import { generateSlug, whatsappLink, rentReminderMsg } from '@/lib/utils'

// ─── Properties ───────────────────────────────────────────────────────────────
export async function getProperties() {
  const sb = createClient()
  const { data, error } = await sb
    .from('properties')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addProperty(input: {
  name: string; address?: string; city?: string; upi_id?: string
}) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await sb.from('properties').insert({
    ...input,
    owner_id: user.id,
    qr_slug: generateSlug(input.name),
  }).select().single()
  if (error) throw error
  return data
}

export async function updateProperty(id: string, updates: Partial<Property>) {
  const sb = createClient()
  const { data, error } = await sb.from('properties').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
export async function getRooms(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('rooms')
    .select('*')
    .eq('property_id', propertyId)
    .order('room_number')
  if (error) throw error
  return data
}

export async function addRoom(input: AddRoomInput) {
  const sb = createClient()
  const { data, error } = await sb.from('rooms').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateRoom(id: string, updates: Partial<AddRoomInput>) {
  const sb = createClient()
  const { data, error } = await sb.from('rooms').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRoom(id: string) {
  const sb = createClient()
  const { error } = await sb.from('rooms').delete().eq('id', id)
  if (error) throw error
}

// ─── Tenants ──────────────────────────────────────────────────────────────────
export async function getTenants(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('tenants')
    .select('*, room:rooms(*)')
    .eq('property_id', propertyId)
    .order('name')
  if (error) throw error
  return data
}

export async function getAllTenants() {
  const sb = createClient()
  const { data, error } = await sb
    .from('tenants')
    .select('*, room:rooms(*), property:properties(name)')
    .order('name')
  if (error) throw error
  return data
}

export async function addTenantByOwner(input: AddTenantInput) {
  const sb = createClient()
  const { password, rent_paid_on_joining, ...tenantData } = input

  // 1. Create auth account for tenant using admin-style invite
  const { data: { user }, error: authError } = await sb.auth.signUp({
    email: `${input.phone}@pgmanager.local`,   // synthetic email using phone
    password,
    options: {
      data: { full_name: input.name, role: 'tenant' },
    },
  })
  if (authError) throw authError

  // 2. Insert tenant row linked to the new auth user
  const { data, error } = await sb.from('tenants').insert({
    ...tenantData,
    auth_user_id: user?.id ?? null,
    status: 'active',
    submitted_via: 'owner_added',
  }).select().single()
  if (error) throw error

  // 3. If any rent was collected at joining time, log it as a real payment
  //    so it shows up correctly in Payments, the Ledger, and Dashboard revenue —
  //    not just as a tenant-record field nobody else can see.
  if (rent_paid_on_joining && rent_paid_on_joining > 0) {
    const joiningMonth = new Date(input.joining_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    const { error: payErr } = await sb.from('payments').insert({
      tenant_id: data.id,
      property_id: input.property_id,
      type: 'rent',
      for_month: joiningMonth,
      total_due: input.monthly_rent,
      amount_received: rent_paid_on_joining,
      method: null,
      approval_status: 'approved',
      submitted_by_tenant: false,
      payment_date: input.joining_date,
      tenant_note: 'Rent paid at joining',
    })
    // Don't fail the whole tenant creation if this secondary insert has an issue —
    // the tenant record itself is already saved. Surface it instead.
    if (payErr) throw new Error(`Tenant added, but failed to log joining-rent payment: ${payErr.message}`)
  }

  return data
}

export async function approveTenant(tenantId: string, password: string, tenantData: Tenant) {
  const sb = createClient()

  // Create auth login for the approved QR-submitted tenant
  const { data: { user }, error: authError } = await sb.auth.signUp({
    email: `${tenantData.phone}@pgmanager.local`,
    password,
    options: { data: { full_name: tenantData.name, role: 'tenant' } },
  })
  if (authError) {
    // The synthetic "phone@pgmanager.local" email must be unique across the
    // whole platform (Supabase Auth doesn't know about per-property scoping).
    // This fires if that phone number already has a login — e.g. the same
    // tenant re-joining after leaving, or two people submitting with a
    // clashing/mistyped number. Give the owner an actionable message instead
    // of Supabase's generic "already registered" text.
    if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already been registered')) {
      throw new Error(
        `A login already exists for ${tenantData.phone}. If this is the same person rejoining, ask them to use their existing password instead of setting a new one. If this is a different person, double-check the mobile number for typos.`
      )
    }
    throw authError
  }

  const { data: { user: me } } = await sb.auth.getUser()
  const { data, error } = await sb.from('tenants').update({
    status: 'active',
    auth_user_id: user?.id,
    approved_by: me?.id,
    approved_at: new Date().toISOString(),
  }).eq('id', tenantId).select().single()
  if (error) throw error
  return data
}

export async function rejectTenant(tenantId: string) {
  const sb = createClient()
  const { error } = await sb.from('tenants').delete().eq('id', tenantId).eq('status', 'pending_approval')
  if (error) throw error
}

export async function updateTenant(id: string, updates: Partial<Tenant>) {
  const sb = createClient()
  const { data, error } = await sb.from('tenants').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTenant(id: string) {
  const sb = createClient()
  const { error } = await sb.from('tenants').delete().eq('id', id)
  if (error) throw error
}

// ─── Collectors ───────────────────────────────────────────────────────────────
export async function getCollectors(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb.from('collectors').select('*').eq('property_id', propertyId)
  if (error) throw error
  return data
}

export async function addCollector(propertyId: string, name: string) {
  const sb = createClient()
  const { data, error } = await sb.from('collectors').insert({ property_id: propertyId, name }).select().single()
  if (error) throw error
  return data
}

export async function deleteCollector(id: string) {
  const sb = createClient()
  const { error } = await sb.from('collectors').delete().eq('id', id)
  if (error) throw error
}

// ─── Payments ─────────────────────────────────────────────────────────────────
export async function getPayments(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('payments')
    .select('*, tenant:tenants(name, phone, room:rooms(room_number)), collector:collectors(name)')
    .eq('property_id', propertyId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPendingApprovals(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('payments')
    .select('*, tenant:tenants(name, phone, room:rooms(room_number))')
    .eq('property_id', propertyId)
    .eq('approval_status', 'pending_approval')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function recordPayment(input: RecordPaymentInput) {
  const sb = createClient()
  const { data, error } = await sb.from('payments').insert({
    ...input,
    approval_status: 'approved',
    submitted_by_tenant: false,
  }).select().single()
  if (error) throw error
  return data
}

export async function approvePayment(paymentId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('payments').update({ approval_status: 'approved' })
    .eq('id', paymentId).select().single()
  if (error) throw error
  return data
}

export async function rejectPayment(paymentId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('payments').update({ approval_status: 'rejected' })
    .eq('id', paymentId).select().single()
  if (error) throw error
  return data
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export async function getExpenses(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .eq('property_id', propertyId)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data
}

export async function addExpense(input: AddExpenseInput) {
  const sb = createClient()
  const { data, error } = await sb.from('expenses').insert(input).select().single()
  if (error) throw error
  return data
}

export async function deleteExpense(id: string) {
  const sb = createClient()
  const { error } = await sb.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ─── Complaints ───────────────────────────────────────────────────────────────
export async function getComplaints(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('complaints')
    .select('*, tenant:tenants(name), room:rooms(room_number)')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addComplaint(input: AddComplaintInput) {
  const sb = createClient()
  const { data, error } = await sb.from('complaints').insert(input).select().single()
  if (error) throw error
  return data
}

export async function resolveComplaint(id: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('complaints')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function updateComplaint(id: string, updates: { status?: string; assigned_to?: string }) {
  const sb = createClient()
  const { data, error } = await sb.from('complaints').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── Dashboard stats (single property) ───────────────────────────────────────
export async function getDashboardStats(propertyId: string) {
  const sb = createClient()
  const [rooms, tenants, payments, complaints] = await Promise.all([
    sb.from('rooms').select('*').eq('property_id', propertyId),
    sb.from('tenants').select('*').eq('property_id', propertyId).eq('status', 'active'),
    sb.from('payments').select('*').eq('property_id', propertyId),
    sb.from('complaints').select('*').eq('property_id', propertyId).neq('status', 'resolved'),
  ])

  const totalBeds = (rooms.data ?? []).reduce((s, r) => s + r.total_beds, 0)
  const occupiedBeds = (tenants.data ?? []).length // 1 active tenant = 1 occupied bed
  const thisMonth = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  const approvedThisMonth = (payments.data ?? []).filter(
    p => p.for_month === thisMonth && p.approval_status === 'approved' && p.type === 'rent'
  )
  const monthlyRevenue = approvedThisMonth.reduce((s, p) => s + p.amount_received, 0)

  // Pending rent correctly handles PARTIAL payments: sum what's actually still owed,
  // not just "has any approved payment been made at all".
  const pendingRent = (tenants.data ?? []).reduce((total, t) => {
    const amountReceivedThisMonth = approvedThisMonth
      .filter(p => p.tenant_id === t.id)
      .reduce((s, p) => s + p.amount_received, 0)
    const stillOwed = Math.max(0, t.monthly_rent - amountReceivedThisMonth)
    return total + stillOwed
  }, 0)

  return {
    totalRooms: rooms.data?.length ?? 0,
    totalBeds,
    occupiedBeds,
    vacantBeds: totalBeds - occupiedBeds,
    monthlyRevenue,
    pendingRent,
    openComplaints: complaints.data?.length ?? 0,
    totalTenants: tenants.data?.length ?? 0,
  }
}

// ─── File uploads (Storage) ───────────────────────────────────────────────────
// Path convention: <property_id>/<tenant_id or room_id>/<filename>
// This matches the storage RLS policies in supabase/additional-setup.sql.

async function uploadFile(bucket: string, path: string, file: File) {
  const sb = createClient()
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = sb.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadTenantDocument(
  propertyId: string, tenantId: string, docType: 'aadhaar' | 'pan' | 'photo', file: File
) {
  const ext = file.name.split('.').pop()
  const path = `${propertyId}/${tenantId}/${docType}.${ext}`
  const url = await uploadFile('tenant-documents', path, file)
  const column = docType === 'aadhaar' ? 'aadhaar_url' : docType === 'pan' ? 'pan_url' : 'photo_url'
  await updateTenant(tenantId, { [column]: url } as any)
  return url
}

export async function uploadRoomPhoto(propertyId: string, roomId: string, file: File) {
  const ext = file.name.split('.').pop()
  const path = `${propertyId}/${roomId}/${Date.now()}.${ext}`
  const url = await uploadFile('room-photos', path, file)
  const sb = createClient()
  const { data: room } = await sb.from('rooms').select('photo_urls').eq('id', roomId).single()
  const updated = [...(room?.photo_urls ?? []), url]
  await updateRoom(roomId, { photo_urls: updated } as any)
  return url
}

export async function uploadPaymentScreenshot(propertyId: string, tenantId: string, file: File) {
  const ext = file.name.split('.').pop()
  const path = `${propertyId}/${tenantId}/${Date.now()}.${ext}`
  return uploadFile('payment-screenshots', path, file)
}

export async function uploadAgreement(propertyId: string, tenantId: string, file: File) {
  const ext = file.name.split('.').pop()
  const path = `${propertyId}/${tenantId}/agreement.${ext}`
  const url = await uploadFile('agreements', path, file)
  await updateTenant(tenantId, { agreement_url: url } as any)
  return url
}

// ─── Notice period tracking ───────────────────────────────────────────────────
export async function getTenantsOnNotice(propertyId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('tenants_on_notice')
    .select('*, room:rooms(room_number)')
    .eq('property_id', propertyId)
    .not('leaving_date', 'is', null)
    .order('leaving_date', { ascending: true })
  if (error) throw error
  return data
}

export async function setTenantLeaving(tenantId: string, leavingDate: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('tenants')
    .update({ leaving_date: leavingDate, status: 'leaving' })
    .eq('id', tenantId).select().single()
  if (error) throw error
  return data
}

export async function markTenantLeft(tenantId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('tenants')
    .update({ status: 'left' })
    .eq('id', tenantId).select().single()
  if (error) throw error
  return data
}

// ─── Bulk WhatsApp reminders ───────────────────────────────────────────────────
// Returns the list of tenants who currently owe rent, each with a ready-to-open
// WhatsApp link. The UI opens these one after another (browsers block silently
// opening many tabs at once, so this is surfaced as a "reminder queue" the
// owner clicks through, typically 1-2 seconds apart).
export function buildBulkReminderQueue(
  pendingTenants: { name: string; phone: string; monthly_rent: number }[],
  propertyName: string
) {
  return pendingTenants.map(t => ({
    name: t.name,
    phone: t.phone,
    link: whatsappLink(t.phone, rentReminderMsg(t.name, t.monthly_rent, propertyName)),
  }))
}

