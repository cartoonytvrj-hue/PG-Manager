// ─── Enums ───────────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'pg_owner' | 'tenant'
export type TenantStatus = 'active' | 'leaving' | 'left' | 'pending_approval'
export type KycStatus = 'pending' | 'verified' | 'rejected'
export type PaymentType = 'rent' | 'deposit' | 'advance'
export type PaymentMethod = 'upi' | 'cash' | 'bank_transfer'
export type PaymentApprovalStatus = 'approved' | 'pending_approval' | 'rejected'
export type ComplaintPriority = 'low' | 'medium' | 'high'
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved'

// ─── Database row types ───────────────────────────────────────────────────────
export interface Profile {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export interface Property {
  id: string
  owner_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  qr_slug: string
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  upi_id: string | null
  created_at: string
}

export interface Room {
  id: string
  property_id: string
  room_number: string
  floor: number
  sharing_type: '1 Sharing' | '2 Sharing' | '3 Sharing' | '4 Sharing'
  total_beds: number
  monthly_rent: number
  notes: string | null
  photo_urls: string[] | null
  created_at: string
}

export interface Tenant {
  id: string
  auth_user_id: string | null
  property_id: string
  room_id: string | null
  bed_label: string | null
  name: string
  phone: string
  email: string | null
  emergency_contact: string | null
  photo_url: string | null
  aadhaar_url: string | null
  aadhaar_status: KycStatus
  pan_url: string | null
  pan_status: KycStatus
  agreement_url: string | null
  notice_period_days: number
  joining_date: string
  leaving_date: string | null
  monthly_rent: number
  deposit_amount: number
  deposit_paid: number
  status: TenantStatus
  submitted_via: 'owner_added' | 'qr_link'
  approved_by: string | null
  approved_at: string | null
  created_at: string
  // joined
  room?: Room
  property?: Property
}

export interface Collector {
  id: string
  property_id: string
  name: string
  created_at: string
}

export interface Payment {
  id: string
  tenant_id: string
  property_id: string
  type: PaymentType
  for_month: string | null
  total_due: number
  amount_received: number
  method: PaymentMethod | null
  collected_by: string | null
  approval_status: PaymentApprovalStatus
  submitted_by_tenant: boolean
  tenant_note: string | null
  screenshot_url: string | null
  payment_date: string
  created_at: string
  // joined
  tenant?: Tenant
  collector?: Collector
}

export interface Complaint {
  id: string
  property_id: string
  tenant_id: string | null
  room_id: string | null
  issue_type: string
  description: string | null
  priority: ComplaintPriority
  status: ComplaintStatus
  assigned_to: string | null
  attachment_url: string | null
  resolved_at: string | null
  created_at: string
  // joined
  tenant?: Tenant
  room?: Room
}

export interface Expense {
  id: string
  property_id: string
  category: string
  amount: number
  notes: string | null
  expense_date: string
  created_at: string
}

// ─── Derived / computed types ────────────────────────────────────────────────
export interface PendingRentItem {
  tenant: Tenant
  dueDate: string
  overdueDays: number
  amountDue: number
}

export interface DashboardStats {
  totalRooms: number
  totalBeds: number
  occupiedBeds: number
  vacantBeds: number
  monthlyRevenue: number
  pendingRent: number
  openComplaints: number
  totalTenants: number
}

// ─── Form input types ────────────────────────────────────────────────────────
export interface AddRoomInput {
  property_id: string
  room_number: string
  floor: number
  sharing_type: Room['sharing_type']
  total_beds: number
  monthly_rent: number
  notes?: string
}

export interface AddTenantInput {
  property_id: string
  room_id: string
  bed_label: string
  name: string
  phone: string
  email?: string
  emergency_contact?: string
  joining_date: string
  monthly_rent: number
  deposit_amount: number
  deposit_paid: number
  rent_paid_on_joining: number   // advance/first-month rent paid at signup, may be partial or 0
  notice_period_days: number
  password: string           // owner sets this for tenant login
}

export interface RecordPaymentInput {
  tenant_id: string
  property_id: string
  type: PaymentType
  for_month?: string
  total_due: number
  amount_received: number
  method: PaymentMethod
  collected_by?: string
  payment_date: string
}

export interface AddExpenseInput {
  property_id: string
  category: string
  amount: number
  notes?: string
  expense_date: string
}

export interface AddComplaintInput {
  property_id: string
  tenant_id?: string
  room_id?: string
  issue_type: string
  description?: string
  priority: ComplaintPriority
  assigned_to?: string
}
