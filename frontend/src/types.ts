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
  saved: '待评估',
  preparing: '准备投递',
  applied: '已投递',
  replied: '已回复',
  interviewing: '面试中',
  hired: '已录用',
  rejected: '未通过',
  withdrawn: '已撤回',
  archived: '已归档',
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
