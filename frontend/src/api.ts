import type { Job, JobInput } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.detail ?? `Request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const getJobs = () => request<Job[]>('/api/jobs')

export const createJob = (job: JobInput) =>
  request<Job>('/api/jobs', { method: 'POST', body: JSON.stringify(job) })

export const updateJob = (id: string, job: JobInput) =>
  request<Job>(`/api/jobs/${id}`, { method: 'PUT', body: JSON.stringify(job) })

export const deleteJob = (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' })

export const importJobs = (jobs: JobInput[]) =>
  request<{ imported: number }>('/api/import/json', { method: 'POST', body: JSON.stringify(jobs) })

export const importCsv = (csv: string) =>
  request<{ imported: number }>('/api/import/csv', {
    method: 'POST',
    body: csv,
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  })

export function downloadExport(format: 'json' | 'csv') {
  window.location.assign(`/api/export?format=${format}`)
}
