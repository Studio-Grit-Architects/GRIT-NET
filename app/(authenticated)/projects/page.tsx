'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Project, Stage, Client } from '@/types'
import { clientLabel } from '@/types'

const TEAL = '#4A8C7A'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  planning:    { label: 'Planning',     color: '#7C6F3E', bg: '#FFF8E1' },
  in_progress: { label: 'In progress',  color: '#2E6B52', bg: '#E8F5EE' },
  paused:      { label: 'Paused',       color: '#8B5E3C', bg: '#FFF0E6' },
  completed:   { label: 'Completed',    color: '#4A5568', bg: '#EDF2F7' },
}

const PROJECT_COLORS = ['#4A8C7A','#5B8DB8','#9B7FB6','#C4714A','#B8A84A','#7A6E9B','#C25C7A','#4A7A8C']
const PROJECT_TYPES = [
  { value: 'time_materials', label: 'Time & Materials' },
  { value: 'fixed_fee', label: 'Fixed Fee' },
  { value: 'non_billable', label: 'Non-Billable' },
]
const RIBA_STAGES = [
  'Stage 0 — Strategic Definition','Stage 1 — Preparation & Brief','Stage 2 — Concept Design',
  'Stage 3 — Spatial Coordination','Stage 4 — Technical Design','Stage 5 — Manufacturing & Construction',
  'Stage 6 — Handover & Close Out','Stage 7 — Use',
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.in_progress
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

export default function ProjectsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin
  const router = useRouter()
  const [projects, setProjects] = useState<(Project & { stages: Stage[]; clientObj?: Client })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newStages, setNewStages] = useState<{ name: string; billable: boolean; fee: string }[]>([])
  const [newStageInput, setNewStageInput] = useState('')
  const [applyRibaTemplates, setApplyRibaTemplates] = useState(false)
  const [delivTemplates, setDelivTemplates] = useState<any[]>([])
  const [newForm, setNewForm] = useState({
    name: '', code: '', client_id: '', color: PROJECT_COLORS[0],
    project_type: 'fixed_fee', start_date: '', end_date: '', notes: '', status: 'in_progress'
  })

  const inputCls = "w-full h-10 px-3 rounded-xl text-sm focus:outline-none"
  const inputStyle = { border: `1px solid ${BORDER}`, background: CREAM }

  async function load() {
    setLoading(true)
    const [projRes, clientRes, tmplRes] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/clients'),
      fetch('/api/deliverable-templates'),
    ])
    setProjects(await projRes.json())
    setClients(await clientRes.json())
    const tmplData = await tmplRes.json()
    setDelivTemplates(Array.isArray(tmplData) ? tmplData : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createProject() {
    if (!newForm.name.trim()) return
    const body: any = { ...newForm, archived: false }
    if (!body.client_id) delete body.client_id
    if (!body.start_date) delete body.start_date
    if (!body.end_date) delete body.end_date
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) { alert('Failed to create project. Please try again.'); return }
    const proj = await r.json()
    for (const s of newStages) {
      const sr = await fetch('/api/projects/stages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: proj.id, name: s.name, billable: s.billable, fee: parseFloat(s.fee) || 0 })
      })
      if (applyRibaTemplates && sr.ok) {
        const stage = await sr.json()
        const match = delivTemplates.find((t: any) => t.riba_stage === s.name)
        if (match) {
          await fetch('/api/deliverable-templates/apply', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: match.id, stage_id: stage.id }),
          })
        }
      }
    }
    setNewForm({ name: '', code: '', client_id: '', color: PROJECT_COLORS[0], project_type: 'fixed_fee', start_date: '', end_date: '', notes: '', status: 'in_progress' })
    setNewStages([]); setNewStageInput(''); setApplyRibaTemplates(false); setShowNew(false)
    load()
  }

  const BILLABLE_DOT   = '#4A8C7A'
  const NONBILLABLE_DOT = '#9B7FB6'

  const billableProjects    = projects.filter(p => p.project_type !== 'non_billable')
  const nonBillableProjects = projects.filter(p => p.project_type === 'non_billable')

  function groupByStatus(items: typeof projects) {
    return Object.entries(STATUS_CONFIG)
      .map(([status, cfg]) => ({ status, cfg, items: items.filter(p => (p.status || 'in_progress') === status) }))
      .filter(g => g.items.length > 0)
  }

  function ProjectRow({ proj, isBillable }: { proj: typeof projects[0]; isBillable: boolean }) {
    const completed  = proj.stages.filter((s: Stage) => s.completed).length
    const total      = proj.stages.length
    const pct        = total > 0 ? Math.round(completed / total * 100) : 0
    const clientName = clientLabel(proj.client)
    const dot        = isBillable ? BILLABLE_DOT : NONBILLABLE_DOT
    return (
      <div
        className="grid items-center px-4 py-3 cursor-pointer transition-colors"
        style={{ gridTemplateColumns: '1fr 120px 80px' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = CREAM}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
        onClick={() => router.push(`/projects/${proj.id}`)}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }}/>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: INK }}>
              {isBillable && proj.code ? `${proj.code} | ` : ''}{proj.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5 sm:hidden">
              <StatusBadge status={proj.status || 'in_progress'} />
              {clientName && <span className="text-xs" style={{ color: `${INK}40` }}>{clientName}</span>}
            </div>
            {clientName && <span className="text-xs hidden sm:inline" style={{ color: `${INK}40` }}>{clientName}</span>}
          </div>
        </div>
        <div className="hidden sm:block"><StatusBadge status={proj.status || 'in_progress'} /></div>
        <div className="flex items-center gap-2 justify-end">
          {total > 0 ? (
            <>
              <div className="w-10 sm:w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#e8e5de' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: dot }}/>
              </div>
              <span className="text-xs w-8 text-right font-mono" style={{ color: `${INK}50` }}>{pct}%</span>
            </>
          ) : <span className="text-xs" style={{ color: `${INK}25` }}>—</span>}
        </div>
      </div>
    )
  }

  function BillingSection({ label, dot, items, isBillable }: { label: string; dot: string; items: typeof projects; isBillable: boolean }) {
    const grouped = groupByStatus(items)
    if (grouped.length === 0) return null
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: dot }}/>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: dot }}>{label}</span>
          <span className="text-xs" style={{ color: `${INK}30` }}>{items.length}</span>
        </div>
        {grouped.map(({ status, cfg, items: statusItems }) => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2 pl-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }}/>
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs" style={{ color: `${INK}25` }}>{statusItems.length}</span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="grid text-xs font-medium uppercase tracking-widest px-4 py-2" style={{ gridTemplateColumns: '1fr 120px 80px', borderBottom: `1px solid ${BORDER}`, background: CREAM, color: `${INK}50` }}>
                    <div>Project</div>
                    <div className="hidden sm:block">Status</div>
                    <div className="text-right">Progress</div>
                  </div>
                  {statusItems.map(proj => (
                    <div key={proj.id} style={{ borderBottom: statusItems.indexOf(proj) < statusItems.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                      <ProjectRow proj={proj} isBillable={isBillable} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-medium tracking-wide" style={{ color: INK }}>Projects</h1>
        {isAdmin && (
          <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>+ New project</button>
        )}
      </div>

      {/* New project form */}
      {showNew && isAdmin && (
        <div className="rounded-xl p-5 mb-6" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: `${INK}60` }}>New project</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project name *</label>
              <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 3 School Lane" className={inputCls} style={inputStyle} autoFocus />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project code</label>
              <input value={newForm.code} onChange={e => setNewForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. 2510" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Client</label>
              <select value={newForm.client_id} onChange={e => setNewForm(f => ({ ...f, client_id: e.target.value }))} className={inputCls} style={inputStyle}>
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Status</label>
              <select value={newForm.status} onChange={e => setNewForm(f => ({ ...f, status: e.target.value }))} className={inputCls} style={inputStyle}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project type</label>
              <select value={newForm.project_type} onChange={e => setNewForm(f => ({ ...f, project_type: e.target.value }))} className={inputCls} style={inputStyle}>
                {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Start date</label>
              <input type="date" value={newForm.start_date} onChange={e => setNewForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>End date</label>
              <input type="date" value={newForm.end_date} onChange={e => setNewForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Notes</label>
              <textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes…" className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={{ ...inputStyle, height: '64px' }} />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: `${INK}50` }}>Colour</label>
              <div className="flex gap-2">{PROJECT_COLORS.map(c => <button key={c} onClick={() => setNewForm(f => ({ ...f, color: c }))} className="w-6 h-6 rounded-full" style={{ background: c, outline: newForm.color === c ? `2px solid ${c}` : undefined, outlineOffset: '2px' }} />)}</div>
            </div>
          </div>
          {/* Stages */}
          <div className="pt-4 mb-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: `${INK}40` }}>Stages</div>
            {newStages.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2 group" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="flex-1 text-sm" style={{ color: INK }}>{s.name}</span>
                <span className="text-xs" style={{ color: `${INK}40` }}>Billable</span>
                <button onClick={() => setNewStages(prev => prev.map((x, j) => j === i ? { ...x, billable: !x.billable } : x))}
                  className="w-8 h-4 rounded-full relative flex-shrink-0" style={{ background: s.billable ? TEAL : '#d1d5db' }}>
                  <div className="w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all" style={{ left: s.billable ? '18px' : '2px' }}/>
                </button>
                <span className="text-xs" style={{ color: `${INK}40` }}>£</span>
                <input type="number" value={s.fee} onChange={e => setNewStages(prev => prev.map((x, j) => j === i ? { ...x, fee: e.target.value } : x))}
                  placeholder="0" className="w-20 h-7 px-2 rounded-lg text-xs text-right focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                <button onClick={() => setNewStages(prev => prev.filter((_, j) => j !== i))} className="text-xs opacity-0 group-hover:opacity-100" style={{ color: '#dc2626' }}>×</button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input value={newStageInput} onChange={e => setNewStageInput(e.target.value)} placeholder="Add stage name…"
                className="flex-1 h-8 px-3 rounded-lg text-xs focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }}
                onKeyDown={e => { if (e.key === 'Enter' && newStageInput.trim()) { setNewStages(p => [...p, { name: newStageInput.trim(), billable: true, fee: '' }]); setNewStageInput('') } }} />
              <button onClick={() => { if (newStageInput.trim()) { setNewStages(p => [...p, { name: newStageInput.trim(), billable: true, fee: '' }]); setNewStageInput('') } }}
                className="h-8 px-3 rounded-lg text-xs" style={{ border: `1px solid ${BORDER}`, color: `${INK}70`, background: 'white' }}>+ Add</button>
              {newStages.length === 0 && (
                <button onClick={() => { setNewStages(RIBA_STAGES.map(name => ({ name, billable: true, fee: '' }))); setApplyRibaTemplates(true) }}
                  className="h-8 px-3 rounded-lg text-xs font-medium" style={{ background: 'rgba(74,140,122,0.08)', color: '#3a7062', border: '1px solid rgba(74,140,122,0.2)' }}>
                  + RIBA stages
                </button>
              )}
            </div>
            {newStages.some(s => RIBA_STAGES.includes(s.name)) && delivTemplates.length > 0 && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input type="checkbox" checked={applyRibaTemplates} onChange={e => setApplyRibaTemplates(e.target.checked)}
                  className="w-3.5 h-3.5" style={{ accentColor: '#4A8C7A' }} />
                <span className="text-xs" style={{ color: `${INK}60` }}>Apply Private Residential deliverables template to matching stages</span>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={createProject} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>Create project</button>
            <button onClick={() => { setShowNew(false); setNewStages([]) }} className="px-4 py-2 rounded-xl text-sm" style={{ border: `1px solid ${BORDER}`, color: `${INK}70` }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>No projects yet.</div>
      ) : (
        <div className="space-y-8">
          <BillingSection label="Billable" dot={BILLABLE_DOT} items={billableProjects} isBillable={true} />
          <BillingSection label="Non-Billable" dot={NONBILLABLE_DOT} items={nonBillableProjects} isBillable={false} />
        </div>
      )}
    </div>
  )
}
