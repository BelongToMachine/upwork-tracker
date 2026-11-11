import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  FileText,
  Inbox,
  Layers3,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { createJob, deleteJob, downloadExport, getJobs, importCsv, importJobs, updateJob } from './api'
import { demoJobs } from './demo-data'
import type { ApplicationStatus, Job, JobInput } from './types'
import { statusLabels, statusOrder } from './types'

type Section = 'all' | 'priority' | 'applied' | 'archived'
type DrawerMode = 'create' | 'edit' | 'details'

const blankJob: JobInput = {
  title: '',
  description: '',
  payment_type: 'fixed',
  pay_min: null,
  pay_max: null,
  currency: 'USD',
  proposals_count: null,
  interviewing_count: null,
  hires_count: null,
  last_seen_by_employer: null,
  invites_sent: null,
  posted_at: null,
  posted_label: null,
  interest: null,
  application_status: 'saved',
  source_url: null,
  notes: '',
  last_updated_by: '',
  remarks: '',
}

const sectionLabels: Record<Section, string> = {
  all: 'All jobs',
  priority: 'High interest',
  applied: 'In progress',
  archived: 'Archived',
}

function toInput(job: Job): JobInput {
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...input } = job
  return input
}

function formatPay(job: Pick<JobInput, 'payment_type' | 'pay_min' | 'pay_max' | 'currency'>) {
  if (job.pay_min == null && job.pay_max == null) return '—'
  const formatAmount = (amount: number | null) =>
    amount == null
      ? 'Not set'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: job.currency || 'USD',
          maximumFractionDigits: 0,
        }).format(amount)
  const range =
    job.pay_min != null && job.pay_max != null && job.pay_min !== job.pay_max
      ? `${formatAmount(job.pay_min)}–${formatAmount(job.pay_max)}`
      : formatAmount(job.pay_min ?? job.pay_max)
  return `${range}${job.payment_type === 'hourly' ? ' / hr' : ''}`
}

function formatPosted(job: Job) {
  if (job.posted_label) return job.posted_label
  if (!job.posted_at) return '—'
  const date = new Date(job.posted_at)
  if (Number.isNaN(date.valueOf())) return job.posted_at
  const diffSeconds = Math.round((date.valueOf() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const [unit, seconds] = units.find(([, size]) => Math.abs(diffSeconds) >= size) ?? ['minute', 60]
  return formatter.format(Math.round(diffSeconds / seconds), unit)
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeLastSeenByEmployer(value: string | null) {
  const text = value?.trim().toLocaleLowerCase()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (formatDateOnly(parsed) !== text) throw new Error('Enter a valid date in YYYY-MM-DD format.')
    return text
  }

  let daysAgo: number | null = null
  if (/\b(?:today|just now)\b/.test(text)) daysAgo = 0
  else if (/\b(?:yesterday|last day|1 day ago|last 24 hours)\b/.test(text)) daysAgo = 1
  else {
    const match = text.match(/\b(\d+)\s+days?\s+ago\b/)
    if (match) daysAgo = Number(match[1])
  }

  if (daysAgo == null || !Number.isFinite(daysAgo) || daysAgo > 36500) {
    throw new Error('Use YYYY-MM-DD, “yesterday,” “last day,” or “N days ago.”')
  }

  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return formatDateOnly(date)
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [interestFilter, setInterestFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [drawerJob, setDrawerJob] = useState<Job | null>(null)
  const [dataMenuOpen, setDataMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const refreshJobs = useCallback(async () => {
    try {
      const records = await getJobs()
      setJobs(records)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load saved jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshJobs()
  }, [refreshJobs])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!drawerMode) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerMode])

  const activeCount = jobs.filter((job) => job.application_status !== 'archived').length
  const priorityCount = jobs.filter((job) => (job.interest ?? 0) >= 4 && job.application_status !== 'archived').length
  const appliedCount = jobs.filter((job) => ['applied', 'replied', 'interviewing'].includes(job.application_status)).length

  const visibleJobs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const filtered = jobs.filter((job) => {
      if (section === 'priority' && ((job.interest ?? 0) < 4 || job.application_status === 'archived')) return false
      if (section === 'applied' && !['applied', 'replied', 'interviewing'].includes(job.application_status)) return false
      if (section === 'archived' && job.application_status !== 'archived') return false
      if (section === 'all' && job.application_status === 'archived') return false
      if (statusFilter !== 'all' && job.application_status !== statusFilter) return false
      if (interestFilter === 'high' && (job.interest ?? 0) < 4) return false
      if (interestFilter === 'unrated' && job.interest != null) return false
      if (needle && !`${job.title} ${job.description} ${job.notes} ${job.remarks}`.toLocaleLowerCase().includes(needle)) return false
      return true
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'interest') return (b.interest ?? 0) - (a.interest ?? 0)
      if (sortBy === 'pay') return (b.pay_max ?? b.pay_min ?? 0) - (a.pay_max ?? a.pay_min ?? 0)
      if (sortBy === 'oldest') return (a.posted_at ?? '').localeCompare(b.posted_at ?? '')
      return (b.posted_at ?? b.created_at).localeCompare(a.posted_at ?? a.created_at)
    })
  }, [interestFilter, jobs, query, section, sortBy, statusFilter])

  function openCreate() {
    setDrawerJob(null)
    setDrawerMode('create')
    setConfirmDelete(false)
  }

  function openDetails(job: Job) {
    setDrawerJob(job)
    setDrawerMode('details')
    setConfirmDelete(false)
  }

  function openEdit(job: Job) {
    setDrawerJob(job)
    setDrawerMode('edit')
    setConfirmDelete(false)
  }

  function closeDrawer() {
    setDrawerMode(null)
    setDrawerJob(null)
    setConfirmDelete(false)
  }

  async function saveJob(input: JobInput) {
    setBusy(true)
    try {
      if (drawerMode === 'edit' && drawerJob) {
        await updateJob(drawerJob.id, input)
        setNotice('Job updated')
      } else {
        await createJob(input)
        setNotice('Job added to your list')
      }
      await refreshJobs()
      closeDrawer()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the job')
    } finally {
      setBusy(false)
    }
  }

  async function quickUpdate(job: Job, changes: Partial<JobInput>) {
    const updated = { ...toInput(job), ...changes }
    try {
      await updateJob(job.id, updated)
      await refreshJobs()
      setNotice('List updated')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update the job')
    }
  }

  async function removeJob() {
    if (!drawerJob) return
    setBusy(true)
    try {
      await deleteJob(drawerJob.id)
      await refreshJobs()
      closeDrawer()
      setNotice('Job deleted')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete the job')
    } finally {
      setBusy(false)
    }
  }

  async function loadDemoData() {
    setBusy(true)
    try {
      await importJobs(demoJobs)
      await refreshJobs()
      setNotice('Sample jobs added. Edit or delete them at any time.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load sample jobs')
    } finally {
      setBusy(false)
    }
  }

  async function handleImportFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setBusy(true)
    setDataMenuOpen(false)
    try {
      const text = await file.text()
      let result: { imported: number }
      if (file.name.toLowerCase().endsWith('.csv')) {
        result = await importCsv(text)
      } else {
        const parsed = JSON.parse(text)
        const records = Array.isArray(parsed) ? parsed : parsed?.jobs
        if (!Array.isArray(records)) throw new Error('JSON must be an array of jobs or an object with a jobs array.')
        result = await importJobs(records)
      }
      await refreshJobs()
      setNotice(`Imported ${result.imported} jobs`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import the file')
    } finally {
      input.value = ''
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Upwork Desk home">
          <span className="brand-mark"><Layers3 size={19} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>Upwork Desk</strong><small>Personal job tracker</small></span>
        </a>

        <div className="sidebar-label">Job list</div>
        <nav className="side-nav" aria-label="Job list">
          <button className={`nav-item ${section === 'all' ? 'active' : ''}`} onClick={() => setSection('all')}>
            <Inbox size={17} /><span>All jobs</span><span className="nav-count">{activeCount}</span>
          </button>
          <button className={`nav-item ${section === 'priority' ? 'active' : ''}`} onClick={() => setSection('priority')}>
            <Star size={17} /><span>High interest</span><span className="nav-count">{priorityCount}</span>
          </button>
          <button className={`nav-item ${section === 'applied' ? 'active' : ''}`} onClick={() => setSection('applied')}>
            <Send size={17} /><span>Applications</span><span className="nav-count">{appliedCount}</span>
          </button>
          <button className={`nav-item ${section === 'archived' ? 'active' : ''}`} onClick={() => setSection('archived')}>
            <Archive size={17} /><span>Archived</span><span className="nav-count">{jobs.filter((job) => job.application_status === 'archived').length}</span>
          </button>
        </nav>

        <div className="sidebar-note">
          <div className="note-heading"><CircleDot size={14} /> Your data stays on this server</div>
          <p>Jobs and notes are stored in your SQLite database. Export a backup whenever you need one.</p>
          <button className="sidebar-link" onClick={() => setDataMenuOpen(true)}>Open data tools <ArrowUpRight size={13} /></button>
        </div>

        <div className="sidebar-footer"><span className="status-dot" /> SQLite database connected</div>
      </aside>

      <main className="main-content" id="top">
        <header className="page-header">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><span>{sectionLabels[section]}</span></div>
          <div className="header-actions">
            <span className="local-badge"><span className="status-dot" /> Personal workspace</span>
            <button className="button button-primary" onClick={openCreate}><Plus size={16} /> Add job</button>
          </div>
        </header>

        <section className="intro-row">
          <div>
            <div className="eyebrow"><BriefcaseBusiness size={14} /> UPWORK JOB TRACKER</div>
            <h1>{sectionLabels[section]}</h1>
            <p className="intro-copy">Evaluate each opportunity and keep every application on track.</p>
          </div>
          <div className="quick-stats" aria-label="Job overview">
            <div><strong>{jobs.length}</strong><span>Tracked jobs</span></div>
            <i />
            <div><strong>{priorityCount}</strong><span>High interest</span></div>
            <i />
            <div><strong>{appliedCount}</strong><span>In progress</span></div>
          </div>
        </section>

        {loadError && <div className="connection-alert"><span>{loadError}</span><button onClick={() => void refreshJobs()}>Retry connection</button></div>}

        <section className="list-section" aria-label="Job list">
          <div className="list-heading-row">
            <div className="list-heading"><h2>{section === 'all' ? 'All jobs' : sectionLabels[section]}</h2><span className="result-count">{visibleJobs.length}</span></div>
            <div className="toolbar">
              <label className="search-field">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs, notes, or remarks…" aria-label="Search jobs" />
                {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <label className="select-field filter-select">
                <SlidersHorizontal size={15} />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by application status">
                  <option value="all">All statuses</option>
                  {statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="select-field sort-select">
                <select value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)} aria-label="Filter by interest level">
                  <option value="all">All interest levels</option><option value="high">High interest (4–5)</option><option value="unrated">Not rated</option>
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="select-field sort-select">
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort jobs">
                  <option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="interest">Interest</option><option value="pay">Pay</option>
                </select>
                <ChevronDown size={14} />
              </label>
              <div className="data-menu-wrap">
                <button className={`button button-quiet data-button ${dataMenuOpen ? 'open' : ''}`} onClick={() => setDataMenuOpen(!dataMenuOpen)} aria-expanded={dataMenuOpen}>
                  <MoreHorizontal size={17} /><span>Data</span><ChevronDown size={13} />
                </button>
                {dataMenuOpen && <>
                  <button className="menu-dismiss" aria-label="Close data menu" onClick={() => setDataMenuOpen(false)} />
                  <div className="data-menu">
                    <div className="menu-eyebrow">Backup and transfer</div>
                    <button onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import JSON / CSV</button>
                    <div className="menu-divider" />
                    <button onClick={() => { downloadExport('json'); setDataMenuOpen(false) }}><ArrowDownToLine size={15} /> Export JSON</button>
                    <button onClick={() => { downloadExport('csv'); setDataMenuOpen(false) }}><ArrowDownToLine size={15} /> Export CSV</button>
                  </div>
                </>}
              </div>
              <input ref={importInputRef} className="visually-hidden" type="file" accept=".json,.csv,application/json,text/csv" aria-hidden="true" tabIndex={-1} onChange={handleImportFile} />
            </div>
          </div>

          <div className="table-frame">
            <div className="table-scroll">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th className="job-col">Job / description</th>
                    <th className="pay-col">Pay</th>
                    <th className="proposals-col">Proposals</th>
                    <th className="interviews-col">Interviewing</th>
                    <th className="hires-col">Hires</th>
                    <th className="invites-col">Invites sent</th>
                    <th className="last-seen-col">Last seen by employer</th>
                    <th className="posted-col">Posted</th>
                    <th className="interest-col">Interest</th>
                    <th className="status-col">Application status</th>
                    <th className="actions-col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={11} className="table-message"><span className="loading-mark" /> Loading jobs…</td></tr> : visibleJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="job-cell">
                        <button className="job-title" onClick={() => openDetails(job)}>{job.title}</button>
                        <div className="job-description">{job.description || 'No description provided'}</div>
                      </td>
                      <td className="pay-cell"><strong>{formatPay(job)}</strong><span>{job.payment_type === 'hourly' ? 'Hourly' : 'Fixed price'}</span></td>
                      <td className="metric-cell"><span className="metric-number">{job.proposals_count ?? '—'}</span><span className="metric-label">proposals</span></td>
                      <td className="metric-cell"><span className="interview-number">{job.interviewing_count ?? '—'}</span><span className="metric-label">in interviews</span></td>
                      <td className="metric-cell"><span className="metric-number">{job.hires_count ?? '—'}</span><span className="metric-label">hires</span></td>
                      <td className="metric-cell"><span className="metric-number">{job.invites_sent ?? '—'}</span><span className="metric-label">invites sent</span></td>
                      <td className="last-seen-cell">{job.last_seen_by_employer ?? '—'}</td>
                      <td className="posted-cell"><Clock3 size={14} /><span>{formatPosted(job)}</span></td>
                      <td className="rating-cell">
                        <div className="rating-buttons" role="group" aria-label={`${job.title} interest rating`}>
                          {[1, 2, 3, 4, 5].map((rating) => <button key={rating} className={`rating-star ${rating <= (job.interest ?? 0) ? 'selected' : ''}`} aria-label={`Set interest to ${rating} out of 5`} title={`${rating} / 5`} onClick={() => void quickUpdate(job, { interest: job.interest === rating ? null : rating })}><Star size={14} fill={rating <= (job.interest ?? 0) ? 'currentColor' : 'none'} /></button>)}
                        </div>
                      </td>
                      <td className="status-cell">
                        <span className={`status-wrap status-${job.application_status}`}>
                          <select aria-label={`${job.title} application status`} value={job.application_status} onChange={(event) => void quickUpdate(job, { application_status: event.target.value as ApplicationStatus })}>
                            {statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                          </select>
                          <ChevronDown size={12} />
                        </span>
                      </td>
                      <td className="actions-cell"><button className="row-more" aria-label={`View ${job.title}`} onClick={() => openDetails(job)}><MoreHorizontal size={17} /></button></td>
                    </tr>
                  ))}
                  {!loading && visibleJobs.length === 0 && (
                    <tr><td colSpan={11} className="table-empty">
                      {jobs.length === 0 && section === 'all' ? <div className="empty-state">
                        <div className="empty-illustration"><FileText size={23} /><span><Plus size={13} /></span></div>
                        <h3>Start by saving jobs worth tracking.</h3>
                        <p>Add a job manually or load sample records to explore how tracking works.</p>
                        <div className="empty-actions"><button className="button button-primary" onClick={openCreate}><Plus size={15} /> Add your first job</button><button className="button button-outline" disabled={busy} onClick={() => void loadDemoData()}><Layers3 size={15} /> Load samples</button></div>
                      </div> : <div className="filtered-empty"><Search size={17} /><span>No jobs match these filters.</span><button onClick={() => { setQuery(''); setStatusFilter('all'); setInterestFilter('all') }}>Clear filters</button></div>}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="table-footer"><span><span className="footer-dot" /> Showing {visibleJobs.length} of {section === 'all' ? activeCount : section === 'archived' ? jobs.filter((job) => job.application_status === 'archived').length : section === 'priority' ? priorityCount : appliedCount} jobs</span><span>Sort: {sortBy === 'recent' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : sortBy === 'pay' ? 'Pay' : 'Interest'}</span></footer>
          </div>
        </section>

        <footer className="page-footer"><span>Make every job search more organized.</span><span><span className="footer-status-dot" /> Your data stays on this server</span></footer>
      </main>

      {drawerMode && <>
        <button className="drawer-backdrop" aria-label="Close details" onClick={closeDrawer} />
        {drawerMode === 'details' && drawerJob ? <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="job-detail-title">
          <div className="drawer-topline"><span>Job details</span><button className="icon-button" autoFocus onClick={closeDrawer} aria-label="Close details"><X size={18} /></button></div>
          <div className="detail-content">
            <div className="detail-kicker">{drawerJob.payment_type === 'hourly' ? 'Hourly contract' : 'Fixed-price contract'}</div>
            <h2 id="job-detail-title">{drawerJob.title}</h2>
            <div className="detail-budget">{formatPay(drawerJob)}</div>
            <div className="detail-meta-row"><span><FileText size={14} /> {drawerJob.proposals_count ?? '—'} proposals</span><span><Clock3 size={14} /> {drawerJob.interviewing_count ?? '—'} in interviews</span><span>{drawerJob.hires_count ?? '—'} hires</span><span><Send size={14} /> {drawerJob.invites_sent ?? '—'} invites sent</span><span>Last seen by employer: {drawerJob.last_seen_by_employer ?? '—'}</span></div>
            <div className="detail-section"><div className="detail-label">Description</div><p className="detail-description">{drawerJob.description || 'No description provided.'}</p></div>
            <div className="detail-section"><div className="detail-label">Notes</div><p className="detail-notes">{drawerJob.notes || 'No notes yet.'}</p></div>
            <div className="detail-section"><div className="detail-label">My remarks</div><p className="detail-notes">{drawerJob.remarks || 'No remarks yet.'}</p></div>
            <div className="detail-section detail-status-section"><div className="detail-label">Application status</div><span className={`status-wrap status-${drawerJob.application_status}`}><select aria-label="Application status" value={drawerJob.application_status} onChange={(event) => { const status = event.target.value as ApplicationStatus; void quickUpdate(drawerJob, { application_status: status }); setDrawerJob({ ...drawerJob, application_status: status }) }}>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select><ChevronDown size={12} /></span></div>
            <div className="detail-updated-row"><span>Activity snapshot · last updated by <strong>{drawerJob.last_updated_by || 'Not set'}</strong></span><time dateTime={drawerJob.updated_at}>{new Date(drawerJob.updated_at).toLocaleString()}</time></div>
            {drawerJob.source_url && <a className="source-link" href={drawerJob.source_url} target="_blank" rel="noreferrer">Open original Upwork job <ArrowUpRight size={15} /></a>}
            <div className="drawer-actions"><button className="button button-primary" onClick={() => openEdit(drawerJob)}>Edit job</button><button className="button button-outline" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button></div>
            {confirmDelete && <div className="delete-confirm"><div><strong>Delete this job?</strong><p>This job cannot be restored from the list after deletion.</p></div><div><button className="text-button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button button-danger" disabled={busy} onClick={() => void removeJob()}>Confirm delete</button></div></div>}
          </div>
        </section> : <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={drawerMode === 'edit' ? 'Edit job' : 'Add job'}>
          <div className="drawer-topline"><span>{drawerMode === 'create' ? 'Add job' : 'Edit job'}</span><button className="icon-button" onClick={closeDrawer} aria-label="Close panel"><X size={18} /></button></div>
          <JobForm key={`${drawerMode}-${drawerJob?.id ?? 'new'}`} initial={drawerJob ? toInput(drawerJob) : blankJob} mode={drawerMode} busy={busy} onCancel={closeDrawer} onSubmit={saveJob} />
        </aside>}
      </>}

      {notice && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  )
}

interface JobFormProps {
  initial: JobInput
  mode: DrawerMode | null
  busy: boolean
  onCancel: () => void
  onSubmit: (job: JobInput) => Promise<void>
}

function JobForm({ initial, mode, busy, onCancel, onSubmit }: JobFormProps) {
  const [form, setForm] = useState<JobInput>({ ...initial })
  const [formError, setFormError] = useState('')
  const change = <K extends keyof JobInput>(key: K, value: JobInput[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (form.pay_min != null && form.pay_max != null && form.pay_min > form.pay_max) {
      setFormError('Minimum pay cannot exceed maximum pay.')
      return
    }
    let lastSeenByEmployer: string | null
    try {
      lastSeenByEmployer = normalizeLastSeenByEmployer(form.last_seen_by_employer)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Enter a valid last seen date.')
      return
    }
    const postedAt = form.posted_at ? new Date(form.posted_at).toISOString() : null
    await onSubmit({ ...form, last_seen_by_employer: lastSeenByEmployer, posted_at: postedAt, posted_label: null, currency: form.currency.trim().toUpperCase() || 'USD' })
  }

  const datetimeLocal = form.posted_at ? toLocalDateTimeInput(form.posted_at) : ''

  return <form className="job-form" onSubmit={submit}>
    <div className="form-heading"><h2>{mode === 'edit' ? 'Edit job' : 'Add job'}</h2><p>Capture the key details now; add the rest later.</p></div>
    <label className="form-field"><span>Job title <b>*</b></span><input autoFocus required maxLength={240} value={form.title} onChange={(event) => change('title', event.target.value)} placeholder="e.g., Fintech product designer" /></label>
    <label className="form-field"><span>Description</span><textarea rows={5} value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="Paste the job description you want to keep…" /></label>
    <div className="form-section-label">Pay and competition</div>
    <div className="form-grid form-grid-budget">
      <label className="form-field"><span>Pricing type</span><select value={form.payment_type} onChange={(event) => change('payment_type', event.target.value as JobInput['payment_type'])}><option value="fixed">Fixed price</option><option value="hourly">Hourly</option></select></label>
      <label className="form-field"><span>Currency</span><input maxLength={3} value={form.currency} onChange={(event) => change('currency', event.target.value.toUpperCase())} /></label>
      <label className="form-field"><span>Minimum pay</span><input type="number" min="0" value={form.pay_min ?? ''} onChange={(event) => change('pay_min', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not set" /></label>
      <label className="form-field"><span>Maximum pay</span><input type="number" min="0" value={form.pay_max ?? ''} onChange={(event) => change('pay_max', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not set" /></label>
      <label className="form-field"><span>Proposals</span><input type="number" min="0" value={form.proposals_count ?? ''} onChange={(event) => change('proposals_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="Unknown" /></label>
      <label className="form-field"><span>Employer interviews</span><input type="number" min="0" value={form.interviewing_count ?? ''} onChange={(event) => change('interviewing_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="Unknown" /></label>
      <label className="form-field"><span>Hires</span><input type="number" min="0" value={form.hires_count ?? ''} onChange={(event) => change('hires_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="Unknown" /></label>
    </div>
    <div className="form-section-label">Your assessment</div>
    <div className="form-grid">
      <label className="form-field"><span>Interest level</span><select value={form.interest ?? ''} onChange={(event) => change('interest', event.target.value === '' ? null : Number(event.target.value))}><option value="">Not rated</option><option value="1">1 · Low interest</option><option value="2">2 · Worth considering</option><option value="3">3 · Worth exploring</option><option value="4">4 · Good fit</option><option value="5">5 · Top priority</option></select></label>
      <label className="form-field"><span>Application status</span><select value={form.application_status} onChange={(event) => change('application_status', event.target.value as ApplicationStatus)}>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
    </div>
    <div className="form-grid">
      <label className="form-field"><span>Posted</span><input type="datetime-local" value={datetimeLocal} onChange={(event) => change('posted_at', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
      <label className="form-field"><span>Original Upwork job URL</span><input type="url" value={form.source_url ?? ''} onChange={(event) => change('source_url', event.target.value || null)} placeholder="https://www.upwork.com/jobs/…" /></label>
    </div>
    <label className="form-field"><span>Personal notes</span><textarea rows={3} value={form.notes} onChange={(event) => change('notes', event.target.value)} placeholder="Fit notes, questions to confirm, or follow-up reminders…" /></label>
    <div className="form-section-label">Employer activity · as of this update</div>
    <div className="form-grid">
      <label className="form-field"><span>Last seen by employer</span><input value={form.last_seen_by_employer ?? ''} onChange={(event) => change('last_seen_by_employer', event.target.value || null)} placeholder="YYYY-MM-DD or viewed last day" /><small className="form-help">Relative wording uses the date you save this update.</small></label>
      <label className="form-field"><span>Invites sent</span><input type="number" min="0" value={form.invites_sent ?? ''} onChange={(event) => change('invites_sent', event.target.value === '' ? null : Number(event.target.value))} placeholder="Unknown" /></label>
    </div>
    <label className="form-field"><span>Last updated by</span><input maxLength={120} value={form.last_updated_by} onChange={(event) => change('last_updated_by', event.target.value)} placeholder="Name or initials" /></label>
    <label className="form-field"><span>My remarks</span><textarea rows={3} value={form.remarks} onChange={(event) => change('remarks', event.target.value)} placeholder="Add your own note about this opportunity…" /></label>
    {formError && <div className="form-error">{formError}</div>}
    <div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add job'}</button></div>
  </form>
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default App
