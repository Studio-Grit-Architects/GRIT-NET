'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { TimeEntry, ProjectMember } from '@/types'
import { clientLabel } from '@/types'
import { hoursToDisplay, formatDate } from '@/lib/dates'
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from 'date-fns'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

type GroupBy = 'project' | 'member' | 'stage'
type ReportTab = 'hours' | 'profitability' | 'deliverables'

function getPresets() {
  const now = new Date()
  return [
    { label: 'This month', from: formatDate(startOfMonth(now)), to: formatDate(endOfMonth(now)) },
    { label: 'Last month', from: formatDate(startOfMonth(subMonths(now, 1))), to: formatDate(endOfMonth(subMonths(now, 1))) },
    { label: 'Last 3 months', from: formatDate(startOfMonth(subMonths(now, 2))), to: formatDate(endOfMonth(now)) },
    { label: 'All time', from: '', to: '' },
  ]
}

function fmtGbp(n: number) {
  return '£' + Math.round(n).toLocaleString('en-GB')
}

function ProfitBadge({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{
      background: positive ? 'rgba(74,140,122,0.1)' : 'rgba(220,38,38,0.08)',
      color: positive ? TEAL_DARK : '#dc2626'
    }}>
      {positive ? '+' : ''}{fmtGbp(value)}
    </span>
  )
}

export default function ReportsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(() => formatDate(startOfMonth(new Date())))
  const [to, setTo] = useState(() => formatDate(endOfMonth(new Date())))
  const [groupBy, setGroupBy] = useState<GroupBy>('project')
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<ReportTab>('profitability')

  // Deliverables tab state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allProjects, setAllProjects] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deliverables, setDeliverables] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [delivTemplates, setDelivTemplates] = useState<any[]>([])
  const [delivProjectId, setDelivProjectId] = useState<string | null>(null)
  const [delivLoading, setDelivLoading] = useState(false)
  const [newDelivInputs, setNewDelivInputs] = useState<Record<string, string>>({})

  async function load() {
    if (!session?.user?.isAdmin) return
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const [entriesRes, membersRes] = await Promise.all([
      fetch(`/api/reports?${params}`),
      fetch('/api/project-members')
    ])
    const entriesData = entriesRes.ok ? await entriesRes.json() : []
    setEntries(Array.isArray(entriesData) ? entriesData : [])
    const membersData = membersRes.ok ? await membersRes.json() : []
    setProjectMembers(Array.isArray(membersData) ? membersData : [])
    setLoading(false)
  }

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!session?.user?.isAdmin) return
    load()
  }, [from, to, sessionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([fetch('/api/projects'), fetch('/api/deliverable-templates')])
      .then(async ([pRes, tRes]) => {
        setAllProjects(await pRes.json())
        setDelivTemplates(await tRes.json())
      })
  }, [])

  useEffect(() => {
    if (!delivProjectId) return
    setDelivLoading(true)
    fetch(`/api/stage-deliverables?project_id=${delivProjectId}`)
      .then(r => r.json())
      .then(data => { setDeliverables(Array.isArray(data) ? data : []); setDelivLoading(false) })
      .catch(() => setDelivLoading(false))
  }, [delivProjectId])

  const totalHours = entries.reduce((s, e) => s + e.hours, 0)

  // Build profitability per project
  function buildProfitability() {
    const projects: Record<string, {
      id: string; name: string; client: string; color: string;
      revenue: number; cost: number; hours: number;
    }> = {}

    entries.forEach(e => {
      if (!e.project) return
      const pid = e.project.id
      if (!projects[pid]) {
        projects[pid] = { id: pid, name: e.project.name, client: clientLabel(e.project.client), color: e.project.color || TEAL, revenue: 0, cost: 0, hours: 0 }
      }
      projects[pid].hours += e.hours

      // Cost: hours × member rate on this project
      const pm = projectMembers.find(m => m.project_id === pid && m.member_id === e.member_id)
      if (pm) projects[pid].cost += e.hours * (pm.hourly_rate || 0)
    })

    // Add stage revenue separately (once per completed billable stage)
    const countedStages = new Set<string>()
    entries.forEach(e => {
      if (!e.project || !e.stage) return
      const sid = e.stage.id
      if (countedStages.has(sid)) return
      countedStages.add(sid)
      const pid = e.project.id
      if (projects[pid] && e.stage.billable !== false && e.stage.completed && e.stage.fee > 0) {
        projects[pid].revenue += e.stage.fee
      }
    })

    return Object.values(projects).sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))
  }

  function buildGroups() {
    const map: Record<string, { key: string; label: string; sub?: string; hours: number; color?: string }> = {}
    entries.forEach(e => {
      let key = '', label = '', sub = '', color = ''
      if (groupBy === 'project') {
        key = e.project?.id || 'unknown'; label = e.project?.name || 'Unknown'; sub = clientLabel(e.project?.client); color = e.project?.color || TEAL
      } else if (groupBy === 'member') {
        key = e.member?.id || 'unknown'; label = e.member?.name || 'Unknown'; sub = e.member?.email || ''
      } else {
        key = `${e.project?.id}||${e.stage?.id}`; label = e.stage?.name || 'Unknown stage'; sub = e.project?.name || ''; color = e.project?.color || TEAL
      }
      if (!map[key]) map[key] = { key, label, sub, hours: 0, color }
      map[key].hours += e.hours
    })
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }

  function getDrillEntries(key: string) {
    return entries.filter(e => {
      if (groupBy === 'project') return e.project?.id === key
      if (groupBy === 'member') return e.member?.id === key
      const [pId, sId] = key.split('||')
      return e.project?.id === pId && e.stage?.id === sId
    }).sort((a, b) => b.date.localeCompare(a.date))
  }

  const groups = buildGroups()
  const maxH = Math.max(...groups.map(g => g.hours), 0.01)
  const presets = getPresets()
  const drillEntries = selected ? getDrillEntries(selected) : []
  const selectedGroup = groups.find(g => g.key === selected)
  const profitData = buildProfitability()
  const totalRevenue = profitData.reduce((s, p) => s + p.revenue, 0)
  const totalCost = profitData.reduce((s, p) => s + p.cost, 0)

  function downloadCSV() {
    const header = 'Date,Project,Client,Stage,Member,Hours,Notes\n'
    const rows = entries.map(e =>
      [e.date, e.project?.name, clientLabel(e.project?.client), e.stage?.name, e.member?.name, e.hours.toFixed(2), e.notes || '']
        .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `mma-timesheets-${from || 'all'}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function addDeliverable(stageId: string) {
    const title = (newDelivInputs[stageId] || '').trim()
    if (!title) return
    const r = await fetch('/api/stage-deliverables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId, title, completed: false }),
    })
    const d = await r.json()
    setDeliverables(prev => [...prev, d])
    setNewDelivInputs(prev => ({ ...prev, [stageId]: '' }))
  }

  async function toggleDeliverable(id: string, completed: boolean) {
    setDeliverables(prev => prev.map(d => d.id === id ? { ...d, completed } : d))
    await fetch('/api/stage-deliverables', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, completed }),
    })
  }

  async function deleteDeliverable(id: string) {
    setDeliverables(prev => prev.filter(d => d.id !== id))
    await fetch('/api/stage-deliverables', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  async function applyTemplate(templateId: string, stageId: string) {
    const r = await fetch('/api/deliverable-templates/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, stage_id: stageId }),
    })
    const newDelivs = await r.json()
    if (Array.isArray(newDelivs)) setDeliverables(prev => [...prev, ...newDelivs])
  }

  if (!session?.user?.isAdmin) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-sm" style={{ color: 'rgba(26,26,26,0.4)' }}>You don&apos;t have permission to view this page.</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-medium tracking-wide" style={{ color: INK }}>Reports</h1>
        <button onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ border: `1px solid ${BORDER}`, background: 'white', color: `${INK}70` }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4 mb-5" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap gap-2 items-center mb-3" style={{ display: tab === 'deliverables' ? 'none' : undefined }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); setSelected(null) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: from === p.from && to === p.to ? TEAL : CREAM, color: from === p.from && to === p.to ? 'white' : `${INK}70`, border: `1px solid ${from === p.from && to === p.to ? TEAL : BORDER}` }}>
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelected(null) }}
              className="flex-1 sm:flex-none h-8 px-2 rounded-lg text-xs focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
            <span className="text-xs" style={{ color: `${INK}40` }}>to</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setSelected(null) }}
              className="flex-1 sm:flex-none h-8 px-2 rounded-lg text-xs focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => setTab('hours')}
            className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: tab === 'hours' ? INK : CREAM, color: tab === 'hours' ? 'white' : `${INK}70`, border: `1px solid ${tab === 'hours' ? INK : BORDER}` }}>
            Hours
          </button>
          <button onClick={() => setTab('profitability')}
            className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: tab === 'profitability' ? INK : CREAM, color: tab === 'profitability' ? 'white' : `${INK}70`, border: `1px solid ${tab === 'profitability' ? INK : BORDER}` }}>
            Profitability
          </button>
          <button onClick={() => setTab('deliverables')}
            className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: tab === 'deliverables' ? INK : CREAM, color: tab === 'deliverables' ? 'white' : `${INK}70`, border: `1px solid ${tab === 'deliverables' ? INK : BORDER}` }}>
            Deliverables
          </button>
          {tab === 'hours' && (
            <>
              <span className="text-xs self-center ml-2" style={{ color: `${INK}40` }}>|</span>
              <span className="text-xs self-center ml-2" style={{ color: `${INK}50` }}>Group by</span>
              {(['project', 'member', 'stage'] as GroupBy[]).map(g => (
                <button key={g} onClick={() => { setGroupBy(g); setSelected(null) }}
                  className="px-3 py-1 rounded-lg text-xs font-medium capitalize"
                  style={{ background: groupBy === g ? '#5B8DB8' : CREAM, color: groupBy === g ? 'white' : `${INK}70`, border: `1px solid ${groupBy === g ? '#5B8DB8' : BORDER}` }}>
                  {g}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {tab === 'hours' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total hours', value: hoursToDisplay(totalHours) },
            { label: 'Entries', value: entries.length.toString() },
            { label: 'Projects', value: new Set(entries.map(e => e.project_id)).size.toString() },
          ].map(card => (
            <div key={card.label} className="rounded-xl p-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: `${INK}50` }}>{card.label}</div>
              <div className="text-2xl font-semibold font-mono" style={{ color: INK }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'profitability' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total revenue', value: fmtGbp(totalRevenue), color: TEAL_DARK },
            { label: 'Total cost', value: fmtGbp(totalCost), color: '#dc2626' },
            { label: 'Profit', value: fmtGbp(totalRevenue - totalCost), color: totalRevenue - totalCost >= 0 ? TEAL_DARK : '#dc2626' },
          ].map(card => (
            <div key={card.label} className="rounded-xl p-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: `${INK}50` }}>{card.label}</div>
              <div className="text-2xl font-semibold font-mono" style={{ color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* HOURS view */}
      {tab === 'hours' && (
        <>
          <div className="rounded-xl p-5 mb-5" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            {loading ? (
              <div className="text-center py-10 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: `${INK}40` }}>No data for this period.</div>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.key}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-all"
                    style={{ background: selected === g.key ? 'rgba(74,140,122,0.06)' : 'transparent', border: `1px solid ${selected === g.key ? 'rgba(74,140,122,0.2)' : 'transparent'}` }}
                    onClick={() => setSelected(selected === g.key ? null : g.key)}>
                    <div className="min-w-0 w-48">
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{g.label}</div>
                      {g.sub && <div className="text-xs truncate" style={{ color: `${INK}50` }}>{g.sub}</div>}
                    </div>
                    <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: CREAM }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(g.hours / maxH * 100)}%`, background: g.color || TEAL }} />
                    </div>
                    <div className="text-sm font-mono font-medium w-16 text-right" style={{ color: TEAL_DARK }}>{hoursToDisplay(g.hours)}</div>
                    <div className="text-xs" style={{ color: `${INK}30` }}>{selected === g.key ? '▲' : '▼'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && selectedGroup && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                <div className="flex items-center gap-3">
                  {selectedGroup.color && <div className="w-3 h-3 rounded-full" style={{ background: selectedGroup.color }}/>}
                  <div>
                    <div className="text-sm font-medium" style={{ color: INK }}>{selectedGroup.label}</div>
                    {selectedGroup.sub && <div className="text-xs" style={{ color: `${INK}50` }}>{selectedGroup.sub}</div>}
                  </div>
                </div>
                <div className="text-sm font-mono font-semibold" style={{ color: TEAL_DARK }}>{hoursToDisplay(selectedGroup.hours)} total</div>
              </div>
              {drillEntries.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm" style={{ color: `${INK}40` }}>No entries found.</div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: '480px' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                      <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Date</th>
                      <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Who</th>
                      {groupBy !== 'stage' && <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Stage</th>}
                      {groupBy !== 'project' && <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Project</th>}
                      <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Notes</th>
                      <th className="text-right px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}50` }}>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillEntries.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < drillEntries.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: `${INK}60` }}>{format(parseISO(e.date), 'd MMM yyyy')}</td>
                        <td className="px-5 py-3" style={{ color: INK }}>{e.member?.name || '—'}</td>
                        {groupBy !== 'stage' && <td className="px-5 py-3 text-xs" style={{ color: `${INK}60` }}>{e.stage?.name || '—'}</td>}
                        {groupBy !== 'project' && <td className="px-5 py-3 text-xs" style={{ color: `${INK}60` }}>{e.project?.name || '—'}</td>}
                        <td className="px-5 py-3 text-xs italic" style={{ color: `${INK}50` }}>{e.notes || <span style={{ color: `${INK}25` }}>—</span>}</td>
                        <td className="px-5 py-3 text-right font-mono font-medium" style={{ color: TEAL_DARK }}>{hoursToDisplay(e.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* DELIVERABLES view */}
      {tab === 'deliverables' && (() => {
        const delivProject = allProjects.find((p: any) => p.id === delivProjectId)
        const activeProjects = allProjects.filter((p: any) => p.status !== 'completed' && !p.archived)
        const rateMap = Object.fromEntries(
          projectMembers.filter(pm => pm.project_id === delivProjectId).map(pm => [pm.member_id, pm.hourly_rate ?? 0])
        )
        const projectEntries = entries.filter(e => e.project_id === delivProjectId)

        return (
          <div>
            {/* Project selector */}
            {!delivProjectId ? (
              <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
                <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Select a project</span>
                </div>
                {activeProjects.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm" style={{ color: `${INK}40` }}>No active projects.</div>
                ) : (
                  activeProjects.map((p: any, i: number) => (
                    <div key={p.id}
                      className="px-5 py-3.5 flex items-center gap-3 cursor-pointer"
                      style={{ borderBottom: i < activeProjects.length - 1 ? `1px solid ${BORDER}` : undefined, background: 'white' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf8'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
                      onClick={() => setDelivProjectId(p.id)}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color || TEAL }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: INK }}>{p.name}</div>
                        {p.client && <div className="text-xs" style={{ color: `${INK}45` }}>{typeof p.client === 'object' ? p.client.name : p.client}</div>}
                      </div>
                      <span className="text-xs" style={{ color: `${INK}30` }}>→</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div>
                {/* Back + project name */}
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => { setDelivProjectId(null); setDeliverables([]) }}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: CREAM, border: `1px solid ${BORDER}`, color: `${INK}60`, cursor: 'pointer' }}>
                    ← All projects
                  </button>
                  {delivProject && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: delivProject.color || TEAL }} />
                      <span className="text-sm font-medium" style={{ color: INK }}>{delivProject.name}</span>
                    </div>
                  )}
                </div>

                {delivLoading ? (
                  <div className="py-12 text-center text-sm" style={{ color: `${INK}40` }}>Loading…</div>
                ) : !delivProject?.stages?.length ? (
                  <div className="rounded-xl px-6 py-12 text-center text-sm" style={{ background: 'white', border: `1px solid ${BORDER}`, color: `${INK}40` }}>
                    No stages on this project yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-2">
                    <div className="flex gap-5" style={{ minWidth: `${delivProject.stages.length * 272}px` }}>
                      {delivProject.stages.map((stage: any) => {
                        const stageDelivs = deliverables
                          .filter(d => d.stage_id === stage.id)
                          .sort((a: any, b: any) => a.position - b.position)
                        const doneCount = stageDelivs.filter((d: any) => d.completed).length
                        const totalCount = stageDelivs.length
                        const matchingTemplate = delivTemplates.find((t: any) => t.riba_stage === stage.name)
                        const stageCost = projectEntries
                          .filter(e => e.stage_id === stage.id)
                          .reduce((sum, e) => sum + e.hours * (rateMap[e.member_id] ?? 0), 0)
                        const fee = Number(stage.fee) || 0
                        const hasBurnBar = fee > 0
                        const overBudget = stageCost > fee
                        const tealBarPct = hasBurnBar ? (overBudget ? (fee / stageCost) * 100 : Math.min(stageCost / fee, 1) * 100) : 0
                        const redPct = overBudget ? ((stageCost - fee) / stageCost) * 100 : 0

                        return (
                          <div key={stage.id} className="rounded-xl overflow-hidden flex-shrink-0"
                            style={{ width: 264, background: 'white', border: `1px solid ${BORDER}` }}>
                            {/* Stage header */}
                            <div className="px-4 py-3" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <span className="text-xs font-semibold leading-snug"
                                  style={{ color: stage.completed ? `${INK}35` : INK, textDecoration: stage.completed ? 'line-through' : undefined }}>
                                  {stage.name}
                                </span>
                                {fee > 0 && (
                                  <span className="text-xs font-mono flex-shrink-0" style={{ color: TEAL_DARK }}>
                                    £{fee.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {totalCount > 0 && (
                                <div className="flex items-center gap-1.5 mb-2">
                                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#e8e5de' }}>
                                    <div className="h-full rounded-full" style={{ width: `${Math.round(doneCount / totalCount * 100)}%`, background: TEAL }} />
                                  </div>
                                  <span className="text-xs font-mono" style={{ color: `${INK}40` }}>{doneCount}/{totalCount}</span>
                                </div>
                              )}
                              {hasBurnBar && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs" style={{ color: `${INK}40` }}>Cost</span>
                                    <span className="text-xs font-mono" style={{ color: overBudget ? '#dc2626' : `${INK}50` }}>
                                      £{Math.round(stageCost).toLocaleString()}
                                      {overBudget && <span style={{ color: '#dc2626' }}> · over by £{Math.round(stageCost - fee).toLocaleString()}</span>}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full overflow-hidden flex" style={{ background: '#e8e5de' }}>
                                    {stageCost > 0 && (
                                      <>
                                        <div className="h-full" style={{ width: `${tealBarPct}%`, background: TEAL, borderRadius: overBudget ? '9999px 0 0 9999px' : '9999px' }} />
                                        {overBudget && <div className="h-full" style={{ width: `${redPct}%`, background: '#dc2626', borderRadius: '0 9999px 9999px 0' }} />}
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Checklist */}
                            <div className="p-3 space-y-1">
                              {stageDelivs.length === 0 && (
                                <p className="text-xs py-3 text-center" style={{ color: `${INK}25` }}>No deliverables yet</p>
                              )}
                              {stageDelivs.map((d: any) => (
                                <div key={d.id} className="flex items-start gap-2 group py-0.5">
                                  <input type="checkbox" checked={d.completed}
                                    onChange={() => toggleDeliverable(d.id, !d.completed)}
                                    className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                                    style={{ accentColor: TEAL }} />
                                  <span className="text-xs flex-1 leading-snug"
                                    style={{ color: d.completed ? `${INK}35` : INK, textDecoration: d.completed ? 'line-through' : undefined }}>
                                    {d.title}
                                  </span>
                                  <button onClick={() => deleteDeliverable(d.id)}
                                    className="opacity-0 group-hover:opacity-100 text-xs w-4 flex-shrink-0 mt-0.5"
                                    style={{ color: `${INK}25` }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#dc2626'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `${INK}25`}>
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                            {/* Footer */}
                            <div className="px-3 pb-3 space-y-2">
                              {matchingTemplate && stageDelivs.length === 0 && (
                                <button onClick={() => applyTemplate(matchingTemplate.id, stage.id)}
                                  className="w-full h-7 rounded-lg text-xs"
                                  style={{ border: '1px solid rgba(74,140,122,0.3)', color: '#3a7062', background: 'rgba(74,140,122,0.05)' }}>
                                  Apply {matchingTemplate.name} template
                                </button>
                              )}
                              <div className="flex gap-1">
                                <input
                                  value={newDelivInputs[stage.id] || ''}
                                  onChange={e => setNewDelivInputs(prev => ({ ...prev, [stage.id]: e.target.value }))}
                                  placeholder="Add deliverable…"
                                  className="flex-1 h-7 px-2 rounded-lg text-xs focus:outline-none"
                                  style={{ border: `1px solid ${BORDER}`, background: CREAM }}
                                  onKeyDown={e => e.key === 'Enter' && addDeliverable(stage.id)}
                                />
                                <button onClick={() => addDeliverable(stage.id)}
                                  className="h-7 px-2.5 rounded-lg text-xs"
                                  style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white' }}>
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* PROFITABILITY view */}
      {tab === 'profitability' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          {loading ? (
            <div className="px-5 py-12 text-center text-sm" style={{ color: `${INK}40` }}>Loading…</div>
          ) : profitData.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm" style={{ color: `${INK}40` }}>No data for this period.</div>
          ) : (
            <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid text-xs font-medium uppercase tracking-widest px-5 py-3" style={{ gridTemplateColumns: '1fr 100px 100px 100px 100px', borderBottom: `1px solid ${BORDER}`, background: CREAM, color: `${INK}50` }}>
                <div>Project</div>
                <div className="text-right">Hours</div>
                <div className="text-right">Revenue</div>
                <div className="text-right">Cost</div>
                <div className="text-right">Profit</div>
              </div>
              {profitData.map((p, i) => (
                <div key={p.id} className="grid items-center px-5 py-4"
                  style={{ gridTemplateColumns: '1fr 100px 100px 100px 100px', borderBottom: i < profitData.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }}/>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{p.name}</div>
                      {clientLabel(p.client) && <div className="text-xs truncate" style={{ color: `${INK}50` }}>{clientLabel(p.client)}</div>}
                    </div>
                  </div>
                  <div className="text-right text-sm font-mono" style={{ color: `${INK}60` }}>{hoursToDisplay(p.hours)}</div>
                  <div className="text-right text-sm font-mono" style={{ color: p.revenue > 0 ? TEAL_DARK : `${INK}30` }}>{p.revenue > 0 ? fmtGbp(p.revenue) : '—'}</div>
                  <div className="text-right text-sm font-mono" style={{ color: p.cost > 0 ? '#dc2626' : `${INK}30` }}>{p.cost > 0 ? fmtGbp(p.cost) : '—'}</div>
                  <div className="text-right"><ProfitBadge value={p.revenue - p.cost} /></div>
                </div>
              ))}
              <div className="grid items-center px-5 py-3 text-sm font-semibold"
                style={{ gridTemplateColumns: '1fr 100px 100px 100px 100px', borderTop: `1px solid ${BORDER}`, background: CREAM }}>
                <div style={{ color: INK }}>Total</div>
                <div className="text-right font-mono" style={{ color: `${INK}60` }}>{hoursToDisplay(totalHours)}</div>
                <div className="text-right font-mono" style={{ color: TEAL_DARK }}>{fmtGbp(totalRevenue)}</div>
                <div className="text-right font-mono" style={{ color: '#dc2626' }}>{fmtGbp(totalCost)}</div>
                <div className="text-right"><ProfitBadge value={totalRevenue - totalCost} /></div>
              </div>
            </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
