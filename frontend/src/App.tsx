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
  posted_at: null,
  posted_label: null,
  interest: null,
  application_status: 'saved',
  source_url: null,
  notes: '',
}

const sectionLabels: Record<Section, string> = {
  all: '全部职位',
  priority: '高意向',
  applied: '进行中',
  archived: '已归档',
}

function toInput(job: Job): JobInput {
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...input } = job
  return input
}

function formatPay(job: Pick<JobInput, 'payment_type' | 'pay_min' | 'pay_max' | 'currency'>) {
  if (job.pay_min == null && job.pay_max == null) return '—'
  const formatAmount = (amount: number | null) =>
    amount == null
      ? '未设置'
      : new Intl.NumberFormat('zh-CN', {
          style: 'currency',
          currency: job.currency || 'USD',
          maximumFractionDigits: 0,
        }).format(amount)
  const range =
    job.pay_min != null && job.pay_max != null && job.pay_min !== job.pay_max
      ? `${formatAmount(job.pay_min)}–${formatAmount(job.pay_max)}`
      : formatAmount(job.pay_min ?? job.pay_max)
  return `${range}${job.payment_type === 'hourly' ? ' / 小时' : ''}`
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
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  const [unit, seconds] = units.find(([, size]) => Math.abs(diffSeconds) >= size) ?? ['minute', 60]
  return formatter.format(Math.round(diffSeconds / seconds), unit)
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
      setLoadError(error instanceof Error ? error.message : '无法读取本地记录')
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
      if (needle && !`${job.title} ${job.description} ${job.notes}`.toLocaleLowerCase().includes(needle)) return false
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
        setNotice('职位信息已保存')
      } else {
        await createJob(input)
        setNotice('职位已添加到列表')
      }
      await refreshJobs()
      closeDrawer()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存职位失败')
    } finally {
      setBusy(false)
    }
  }

  async function quickUpdate(job: Job, changes: Partial<JobInput>) {
    const updated = { ...toInput(job), ...changes }
    try {
      await updateJob(job.id, updated)
      await refreshJobs()
      setNotice('列表已更新')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '更新职位失败')
    }
  }

  async function removeJob() {
    if (!drawerJob) return
    setBusy(true)
    try {
      await deleteJob(drawerJob.id)
      await refreshJobs()
      closeDrawer()
      setNotice('职位已删除')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除职位失败')
    } finally {
      setBusy(false)
    }
  }

  async function loadDemoData() {
    setBusy(true)
    try {
      await importJobs(demoJobs)
      await refreshJobs()
      setNotice('示例职位已添加，可随时编辑或删除')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '载入示例职位失败')
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
        if (!Array.isArray(records)) throw new Error('JSON 文件应为职位数组，或包含 jobs 数组。')
        result = await importJobs(records)
      }
      await refreshJobs()
      setNotice(`已导入 ${result.imported} 条职位`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入文件失败')
    } finally {
      input.value = ''
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Upwork Desk 首页">
          <span className="brand-mark"><Layers3 size={19} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>Upwork Desk</strong><small>个人职位工作台</small></span>
        </a>

        <div className="sidebar-label">职位列表</div>
        <nav className="side-nav" aria-label="职位列表">
          <button className={`nav-item ${section === 'all' ? 'active' : ''}`} onClick={() => setSection('all')}>
            <Inbox size={17} /><span>全部职位</span><span className="nav-count">{activeCount}</span>
          </button>
          <button className={`nav-item ${section === 'priority' ? 'active' : ''}`} onClick={() => setSection('priority')}>
            <Star size={17} /><span>高意向</span><span className="nav-count">{priorityCount}</span>
          </button>
          <button className={`nav-item ${section === 'applied' ? 'active' : ''}`} onClick={() => setSection('applied')}>
            <Send size={17} /><span>投递进度</span><span className="nav-count">{appliedCount}</span>
          </button>
          <button className={`nav-item ${section === 'archived' ? 'active' : ''}`} onClick={() => setSection('archived')}>
            <Archive size={17} /><span>已归档</span><span className="nav-count">{jobs.filter((job) => job.application_status === 'archived').length}</span>
          </button>
        </nav>

        <div className="sidebar-note">
          <div className="note-heading"><CircleDot size={14} /> 数据保存在本机</div>
          <p>职位和备注保存在本地数据库中。需要备份时，可随时导出。</p>
          <button className="sidebar-link" onClick={() => setDataMenuOpen(true)}>打开数据工具 <ArrowUpRight size={13} /></button>
        </div>

        <div className="sidebar-footer"><span className="status-dot" /> 本地数据库已连接</div>
      </aside>

      <main className="main-content" id="top">
        <header className="page-header">
          <div className="breadcrumb"><span>工作台</span><span className="breadcrumb-slash">/</span><span>{sectionLabels[section]}</span></div>
          <div className="header-actions">
            <span className="local-badge"><span className="status-dot" /> 仅本机使用</span>
            <button className="button button-primary" onClick={openCreate}><Plus size={16} /> 新增职位</button>
          </div>
        </header>

        <section className="intro-row">
          <div>
            <div className="eyebrow"><BriefcaseBusiness size={14} /> UPWORK 职位追踪</div>
            <h1>{sectionLabels[section]}</h1>
            <p className="intro-copy">快速判断职位价值，顺手跟进每一次投递。</p>
          </div>
          <div className="quick-stats" aria-label="职位概览">
            <div><strong>{jobs.length}</strong><span>已记录</span></div>
            <i />
            <div><strong>{priorityCount}</strong><span>高意向</span></div>
            <i />
            <div><strong>{appliedCount}</strong><span>投递中</span></div>
          </div>
        </section>

        {loadError && <div className="connection-alert"><span>{loadError}</span><button onClick={() => void refreshJobs()}>重新连接</button></div>}

        <section className="list-section" aria-label="职位列表">
          <div className="list-heading-row">
            <div className="list-heading"><h2>{section === 'all' ? '全部职位' : sectionLabels[section]}</h2><span className="result-count">{visibleJobs.length}</span></div>
            <div className="toolbar">
              <label className="search-field">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索职位、备注…" aria-label="搜索职位" />
                {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="清除搜索"><X size={14} /></button>}
              </label>
              <label className="select-field filter-select">
                <SlidersHorizontal size={15} />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="按投递状态筛选">
                  <option value="all">全部状态</option>
                  {statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="select-field sort-select">
                <select value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)} aria-label="按意向程度筛选">
                  <option value="all">全部意向</option><option value="high">高意向（4–5）</option><option value="unrated">尚未评分</option>
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="select-field sort-select">
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="职位排序">
                  <option value="recent">最新发布</option><option value="oldest">最早发布</option><option value="interest">意向优先</option><option value="pay">报酬优先</option>
                </select>
                <ChevronDown size={14} />
              </label>
              <div className="data-menu-wrap">
                <button className={`button button-quiet data-button ${dataMenuOpen ? 'open' : ''}`} onClick={() => setDataMenuOpen(!dataMenuOpen)} aria-expanded={dataMenuOpen}>
                  <MoreHorizontal size={17} /><span>数据</span><ChevronDown size={13} />
                </button>
                {dataMenuOpen && <>
                  <button className="menu-dismiss" aria-label="关闭数据菜单" onClick={() => setDataMenuOpen(false)} />
                  <div className="data-menu">
                    <div className="menu-eyebrow">备份与迁移</div>
                    <button onClick={() => importInputRef.current?.click()}><Upload size={15} /> 导入 JSON / CSV</button>
                    <div className="menu-divider" />
                    <button onClick={() => { downloadExport('json'); setDataMenuOpen(false) }}><ArrowDownToLine size={15} /> 导出 JSON</button>
                    <button onClick={() => { downloadExport('csv'); setDataMenuOpen(false) }}><ArrowDownToLine size={15} /> 导出 CSV</button>
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
                    <th className="job-col">职位 / 工作内容</th>
                    <th className="pay-col">报酬</th>
                    <th className="proposals-col">申请人数</th>
                    <th className="interviews-col">面试中</th>
                    <th className="posted-col">发布时间</th>
                    <th className="interest-col">我的意向</th>
                    <th className="status-col">投递状态</th>
                    <th className="actions-col"><span className="visually-hidden">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} className="table-message"><span className="loading-mark" /> 正在读取职位列表…</td></tr> : visibleJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="job-cell">
                        <button className="job-title" onClick={() => openDetails(job)}>{job.title}</button>
                        <div className="job-description">{job.description || '尚未填写工作内容'}</div>
                      </td>
                      <td className="pay-cell"><strong>{formatPay(job)}</strong><span>{job.payment_type === 'hourly' ? '时薪' : '固定报价'}</span></td>
                      <td className="metric-cell"><span className="metric-number">{job.proposals_count ?? '—'}</span><span className="metric-label">人申请</span></td>
                      <td className="metric-cell"><span className="interview-number">{job.interviewing_count ?? '—'}</span><span className="metric-label">人面试中</span></td>
                      <td className="posted-cell"><Clock3 size={14} /><span>{formatPosted(job)}</span></td>
                      <td className="rating-cell">
                        <div className="rating-buttons" role="group" aria-label={`${job.title} 的意向评分`}>
                          {[1, 2, 3, 4, 5].map((rating) => <button key={rating} className={`rating-star ${rating <= (job.interest ?? 0) ? 'selected' : ''}`} aria-label={`设置意向为 ${rating} 分（共 5 分）`} title={`${rating} / 5`} onClick={() => void quickUpdate(job, { interest: job.interest === rating ? null : rating })}><Star size={14} fill={rating <= (job.interest ?? 0) ? 'currentColor' : 'none'} /></button>)}
                        </div>
                      </td>
                      <td className="status-cell">
                        <span className={`status-wrap status-${job.application_status}`}>
                          <select aria-label={`${job.title} 的投递状态`} value={job.application_status} onChange={(event) => void quickUpdate(job, { application_status: event.target.value as ApplicationStatus })}>
                            {statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                          </select>
                          <ChevronDown size={12} />
                        </span>
                      </td>
                      <td className="actions-cell"><button className="row-more" aria-label={`查看 ${job.title}`} onClick={() => openDetails(job)}><MoreHorizontal size={17} /></button></td>
                    </tr>
                  ))}
                  {!loading && visibleJobs.length === 0 && (
                    <tr><td colSpan={8} className="table-empty">
                      {jobs.length === 0 && section === 'all' ? <div className="empty-state">
                        <div className="empty-illustration"><FileText size={23} /><span><Plus size={13} /></span></div>
                        <h3>先把值得关注的职位放进来。</h3>
                        <p>手动添加职位，或载入几条示例记录，快速了解整理和跟进方式。</p>
                        <div className="empty-actions"><button className="button button-primary" onClick={openCreate}><Plus size={15} /> 添加第一条职位</button><button className="button button-outline" disabled={busy} onClick={() => void loadDemoData()}><Layers3 size={15} /> 载入示例</button></div>
                      </div> : <div className="filtered-empty"><Search size={17} /><span>没有符合条件的职位。</span><button onClick={() => { setQuery(''); setStatusFilter('all'); setInterestFilter('all') }}>清除筛选</button></div>}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="table-footer"><span><span className="footer-dot" /> 当前显示 {visibleJobs.length} / {section === 'all' ? activeCount : section === 'archived' ? jobs.filter((job) => job.application_status === 'archived').length : section === 'priority' ? priorityCount : appliedCount} 条职位</span><span>排序：{sortBy === 'recent' ? '最新发布' : sortBy === 'oldest' ? '最早发布' : sortBy === 'pay' ? '报酬优先' : '意向优先'}</span></footer>
          </div>
        </section>

        <footer className="page-footer"><span>让每一次求职选择，都更有条理。</span><span><span className="footer-status-dot" /> 数据仅保存在本机</span></footer>
      </main>

      {drawerMode && <>
        <button className="drawer-backdrop" aria-label="关闭详情" onClick={closeDrawer} />
        <aside className="detail-drawer" aria-label={drawerMode === 'details' ? '职位详情' : '职位编辑'}>
          <div className="drawer-topline"><span>{drawerMode === 'create' ? '新增职位' : drawerMode === 'edit' ? '编辑职位' : '职位详情'}</span><button className="icon-button" onClick={closeDrawer} aria-label="关闭面板"><X size={18} /></button></div>
          {drawerMode === 'details' && drawerJob ? <div className="detail-content">
            <div className="detail-kicker">{drawerJob.payment_type === 'hourly' ? '时薪合同' : '固定价格合同'}</div>
            <h2>{drawerJob.title}</h2>
            <div className="detail-budget">{formatPay(drawerJob)}</div>
            <div className="detail-meta-row"><span><FileText size={14} /> {drawerJob.proposals_count ?? '—'} 人申请</span><span><Clock3 size={14} /> {drawerJob.interviewing_count ?? '—'} 人面试中</span></div>
            <div className="detail-section"><div className="detail-label">工作内容</div><p className="detail-description">{drawerJob.description || '尚未填写工作内容。'}</p></div>
            <div className="detail-section"><div className="detail-label">我的备注</div><p className="detail-notes">{drawerJob.notes || '还没有添加备注。'}</p></div>
            <div className="detail-section detail-status-section"><div className="detail-label">投递状态</div><span className={`status-wrap status-${drawerJob.application_status}`}><select aria-label="投递状态" value={drawerJob.application_status} onChange={(event) => { const status = event.target.value as ApplicationStatus; void quickUpdate(drawerJob, { application_status: status }); setDrawerJob({ ...drawerJob, application_status: status }) }}>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select><ChevronDown size={12} /></span></div>
            {drawerJob.source_url && <a className="source-link" href={drawerJob.source_url} target="_blank" rel="noreferrer">打开 Upwork 原职位 <ArrowUpRight size={15} /></a>}
            <div className="drawer-actions"><button className="button button-primary" onClick={() => openEdit(drawerJob)}>编辑职位</button><button className="button button-outline" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> 删除</button></div>
            {confirmDelete && <div className="delete-confirm"><div><strong>删除这条职位记录？</strong><p>删除后无法从本地列表中恢复。</p></div><div><button className="text-button" onClick={() => setConfirmDelete(false)}>取消</button><button className="button button-danger" disabled={busy} onClick={() => void removeJob()}>确认删除</button></div></div>}
          </div> : <JobForm key={`${drawerMode}-${drawerJob?.id ?? 'new'}`} initial={drawerJob ? toInput(drawerJob) : blankJob} mode={drawerMode} busy={busy} onCancel={closeDrawer} onSubmit={saveJob} />}
        </aside>
      </>}

      {notice && <div className="toast" role="status"><span className="toast-check"><Check size={14} /></span>{notice}<button onClick={() => setNotice('')} aria-label="关闭提示"><X size={14} /></button></div>}
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
      setFormError('最低报价不能高于最高报价。')
      return
    }
    const postedAt = form.posted_at ? new Date(form.posted_at).toISOString() : null
    await onSubmit({ ...form, posted_at: postedAt, posted_label: null, currency: form.currency.trim().toUpperCase() || 'USD' })
  }

  const datetimeLocal = form.posted_at ? toLocalDateTimeInput(form.posted_at) : ''

  return <form className="job-form" onSubmit={submit}>
    <div className="form-heading"><h2>{mode === 'edit' ? '编辑职位' : '新增职位'}</h2><p>先记录关键条件，其他细节之后再补充。</p></div>
    <label className="form-field"><span>职位标题 <b>*</b></span><input autoFocus required maxLength={240} value={form.title} onChange={(event) => change('title', event.target.value)} placeholder="例如：金融科技产品设计师" /></label>
    <label className="form-field"><span>工作内容</span><textarea rows={5} value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="粘贴需要记住的职位描述…" /></label>
    <div className="form-section-label">报酬与竞争情况</div>
    <div className="form-grid form-grid-budget">
      <label className="form-field"><span>报价类型</span><select value={form.payment_type} onChange={(event) => change('payment_type', event.target.value as JobInput['payment_type'])}><option value="fixed">固定价格</option><option value="hourly">按小时</option></select></label>
      <label className="form-field"><span>币种</span><input maxLength={3} value={form.currency} onChange={(event) => change('currency', event.target.value.toUpperCase())} /></label>
      <label className="form-field"><span>最低金额</span><input type="number" min="0" value={form.pay_min ?? ''} onChange={(event) => change('pay_min', event.target.value === '' ? null : Number(event.target.value))} placeholder="未填写" /></label>
      <label className="form-field"><span>最高金额</span><input type="number" min="0" value={form.pay_max ?? ''} onChange={(event) => change('pay_max', event.target.value === '' ? null : Number(event.target.value))} placeholder="未填写" /></label>
      <label className="form-field"><span>申请人数</span><input type="number" min="0" value={form.proposals_count ?? ''} onChange={(event) => change('proposals_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="未知" /></label>
      <label className="form-field"><span>雇主面试人数</span><input type="number" min="0" value={form.interviewing_count ?? ''} onChange={(event) => change('interviewing_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="未知" /></label>
    </div>
    <div className="form-section-label">我的判断</div>
    <div className="form-grid">
      <label className="form-field"><span>意向程度</span><select value={form.interest ?? ''} onChange={(event) => change('interest', event.target.value === '' ? null : Number(event.target.value))}><option value="">尚未评分</option><option value="1">1 · 意向较低</option><option value="2">2 · 可以考虑</option><option value="3">3 · 值得了解</option><option value="4">4 · 比较匹配</option><option value="5">5 · 优先投递</option></select></label>
      <label className="form-field"><span>投递状态</span><select value={form.application_status} onChange={(event) => change('application_status', event.target.value as ApplicationStatus)}>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
    </div>
    <div className="form-grid">
      <label className="form-field"><span>发布时间</span><input type="datetime-local" value={datetimeLocal} onChange={(event) => change('posted_at', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
      <label className="form-field"><span>Upwork 原职位链接</span><input type="url" value={form.source_url ?? ''} onChange={(event) => change('source_url', event.target.value || null)} placeholder="https://www.upwork.com/jobs/…" /></label>
    </div>
    <label className="form-field"><span>个人备注</span><textarea rows={3} value={form.notes} onChange={(event) => change('notes', event.target.value)} placeholder="匹配原因、需要确认的问题、跟进提醒…" /></label>
    {formError && <div className="form-error">{formError}</div>}
    <div className="form-footer"><button type="button" className="button button-quiet" onClick={onCancel}>取消</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? '正在保存…' : mode === 'edit' ? '保存修改' : '添加职位'}</button></div>
  </form>
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default App
