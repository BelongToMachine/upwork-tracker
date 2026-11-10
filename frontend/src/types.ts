export type PaymentType = 'hourly' | 'fixed'

export type ApplicationStatus =
  | 'saved'
  | 'preparing'
  | 'applied'
  | 'replied'
  | 'interviewing'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'archived'

export interface Job {
  id: string
  title: string
  description: string
  payment_type: PaymentType
  pay_min: number | null
  pay_max: number | null
  currency: string
  proposals_count: number | null
  interviewing_count: number | null
  posted_at: string | null
  posted_label: string | null
  interest: number | null
  application_status: ApplicationStatus
  source_url: string | null
  notes: string
  created_at: string
  updated_at: string
}

export type JobInput = Omit<Job, 'id' | 'created_at' | 'updated_at'>

export const statusLabels: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  preparing: 'Preparing',
  applied: 'Applied',
  replied: 'Replied',
  interviewing: 'Interviewing',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  archived: 'Archived',
}

export const statusOrder: ApplicationStatus[] = [
  'saved',
  'preparing',
  'applied',
  'replied',
  'interviewing',
  'hired',
  'rejected',
  'withdrawn',
  'archived',
]
