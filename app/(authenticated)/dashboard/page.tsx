'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getWeekDays, formatDate, formatDisplay, formatDayName,
  formatWeekRange, nextWeek, prevWeek, isToday, hoursToDisplay, parseHoursInput
} from '@/lib/dates'
import { format, addDays, subDays } from 'date-fns'
import type { Project, Stage, TimeEntry, WeeklyRow } from '@/types'
import { clientLabel } from '@/types'
import clsx from 'clsx'

type ViewMode = 'week' | 'day'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

export default function DashboardPage() {
  const { data: session } = useSession()
  const memberId = session?.user?.memberId
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  )
  const [currentDate, setCurrentDate] = useState(new Date())
  const [projects, setProjects] = useState<(Project & { stages: Stage[] })[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [rows, setRows] = useState<WeeklyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [showAddRow, setShowAddRow] = useState(false)
  const loadSeqRef = useRef(0)
  const [addRowProject, setAddRowProject] = useState('')
  const [addRowStage, setAddRowStage] = useState('')
  const [showDayModal, setShowDayModal] = useState(false)
  const [dayEntry, setDayEntry] = useState({ projectId: '', stageId: '', hours: '', notes: '' })
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const timers = saveTimers.current
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [])

  const weekDays = getWeekDays(currentDate)
  const workDays = weekDays.slice(0, 5)
  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])
  const todayStr = formatDate(currentDate)

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects)
  }, [])

  const loadEntries = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    const seq = ++loadSeqRef.current
    const from = viewMode === 'week' ? weekStart : todayStr
    const to = viewMode === 'week' ? weekEnd : todayStr
    const res = await fetch(`/api/entries?member_id=${memberId}&week_start=${from}&week_end=${to}`)
    // Discard stale responses (e.g. rapid week navigation)
    if (seq !== loadSeqRef.current) return
    const data = res.ok ? await res.json() : []
    setEntries(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [memberId, weekStart, weekEnd, todayStr, viewMode])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    setRows(prev => {
      const rowMap: Record<string, WeeklyRow> = {}
      // Seed with existing rows (preserves manually-added rows that have no entries yet)
      prev.forEach(r => {
        const key = `${r.project.id}||${r.stage.id}`
        rowMap[key] = { project: r.project, stage: r.stage, entries: {} }
      })
      // Populate/overwrite entries from the fetched data
      entries.forEach(e => {
        const key = `${e.project_id}||${e.stage_id}`
        if (!rowMap[key] && e.project && e.stage) {
          rowMap[key] = { project: e.project, stage: e.stage, entries: {} }
        }
        if (rowMap[key]) rowMap[key].entries[e.date] = e
      })
      return Object.values(rowMap)
    })
  }, [entries])

  function confirmAddRow() {
    if (!addRowProject || !addRowStage) return
    const proj = projects.find(p => p.id === addRowProject)
    const stage = proj?.stages.find(s => s.id === addRowStage)
    if (!proj || !stage) return
    if (rows.find(r => r.project.id === proj.id && r.stage.id === stage.id)) { setShowAddRow(false); return }
    setRows(prev => [...prev, { project: proj, stage, entries: {} }])
    setShowAddRow(false); setAddRowProject(''); setAddRowStage('')
  }

  function removeRow(projId: string, stageId: string) {
    setRows(prev => prev.filter(r => !(r.project.id === projId && r.stage.id === stageId)))
  }

  async function saveCell(projId: string, stageId: string, date: string, hours: number, notes?: string) {
    if (!memberId) return
    setSaving(true)
    const cellKey = `${projId}||${stageId}||${date}`
    const r = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, project_id: projId, stage_id: stageId, date, hours: hours || 0, notes: notes || null })
    })
    setSaving(false)
    if (!r.ok) {
      setCellErrors(prev => ({ ...prev, [cellKey]: 'Save failed' }))
    } else {
      setCellErrors(prev => { const next = { ...prev }; delete next[cellKey]; return next })
      loadEntries()
    }
  }

  function handleCellChange(projId: string, stageId: string, date: string, value: string) {
    const key = `${projId}||${stageId}||${date}`
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => {
      const hours = parseHoursInput(value)
      if (hours !== null) saveCell(projId, stageId, date, hours)
    }, 800)
  }

  async function saveDayEntry() {
    if (!dayEntry.projectId || !dayEntry.stageId || !dayEntry.hours) return
    const hours = parseHoursInput(dayEntry.hours)
    if (!hours) return
    await saveCell(dayEntry.projectId, dayEntry.stageId, todayStr, hours, dayEntry.notes)
    setShowDayModal(false)
    setDayEntry({ projectId: '', stageId: '', hours: '', notes: '' })
  }

  const weekTotal = entries.reduce((sum, e) => sum + (e.hours || 0), 0)
  const dayTotals = workDays.map(d => {
    const ds = formatDate(d)
    return entries.filter(e => e.date === ds).reduce((sum, e) => sum + (e.hours || 0), 0)
  })
  const todayEntries = entries.filter(e => e.date === todayStr)
  const todayTotal = todayEntries.reduce((sum, e) => sum + (e.hours || 0), 0)
  const availableStages = addRowProject ? (projects.find(p => p.id === addRowProject)?.stages || []).filter(s => !s.completed) : []
  const dayModalStages = dayEntry.projectId ? (projects.find(p => p.id === dayEntry.projectId)?.stages || []).filter(s => !s.completed) : []

  const inputCls = "w-full h-10 px-3 rounded-xl text-sm focus:outline-none"
  const inputStyle = { border: `1px solid ${BORDER}`, background: 'white' }
  const inputFocusStyle = { border: `1px solid ${TEAL}`, boxShadow: `0 0 0 2px rgba(74,140,122,0.12)` }

  if (!session) return null

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => viewMode === 'week' ? setCurrentDate(prevWeek(currentDate)) : setCurrentDate(subDays(currentDate, 1))}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-sm transition-colors"
            style={{ border: `1px solid ${BORDER}`, background: 'white', color: INK }}>←</button>
          <button onClick={() => viewMode === 'week' ? setCurrentDate(nextWeek(currentDate)) : setCurrentDate(addDays(currentDate, 1))}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-sm transition-colors"
            style={{ border: `1px solid ${BORDER}`, background: 'white', color: INK }}>→</button>
          <h1 className="text-sm sm:text-base font-medium tracking-wide truncate" style={{ color: INK }}>
            {viewMode === 'week' ? formatWeekRange(currentDate) : (isToday(currentDate) ? `Today — ${format(currentDate, 'EEE, d MMM')}` : format(currentDate, 'EEE, d MMM yyyy'))}
          </h1>
          {saving && <span className="text-xs flex-shrink-0" style={{ color: TEAL }}>Saving…</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setCurrentDate(new Date())}
            className="text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: `1px solid ${BORDER}`, background: 'white', color: `${INK}99` }}>Today</button>
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <button onClick={() => setViewMode('day')}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ background: viewMode === 'day' ? TEAL : 'white', color: viewMode === 'day' ? 'white' : `${INK}66` }}>Day</button>
            <button onClick={() => setViewMode('week')}
              className="px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ background: viewMode === 'week' ? TEAL : 'white', color: viewMode === 'week' ? 'white' : `${INK}66`, borderLeft: `1px solid ${BORDER}` }}>Week</button>
          </div>
        </div>
      </div>

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="overflow-x-auto rounded-xl shadow-sm" style={{ border: `1px solid ${BORDER}` }}>
        <div className="min-w-[700px] rounded-xl overflow-hidden" style={{ background: 'white' }}>
          <div className="grid border-b" style={{ gridTemplateColumns: '1fr repeat(5, 80px) 72px 36px', borderColor: BORDER, background: CREAM }}>
            <div className="px-4 py-3 text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}60` }}>Project / Stage</div>
            {workDays.map(d => (
              <div key={formatDate(d)} className="py-3 text-center" style={{ borderLeft: `1px solid ${BORDER}`, background: isToday(d) ? '#e8f2ef' : undefined }}>
                <div className="text-xs font-medium" style={{ color: isToday(d) ? TEAL : `${INK}60` }}>{formatDayName(d)}</div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: isToday(d) ? TEAL : `${INK}40` }}>{formatDisplay(d)}</div>
              </div>
            ))}
            <div className="py-3 text-center" style={{ borderLeft: `1px solid ${BORDER}` }}>
              <div className="text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}60` }}>Total</div>
            </div>
            <div/>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-sm" style={{ color: `${INK}40` }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm mb-1" style={{ color: `${INK}40` }}>No rows yet this week</p>
              <p className="text-xs" style={{ color: `${INK}30` }}>Click + Add row below to start</p>
            </div>
          ) : (
            rows.map(row => {
              const rowTotal = workDays.reduce((sum, d) => {
                const e = row.entries[formatDate(d)]
                return sum + (e?.hours || 0)
              }, 0)
              return (
                <div key={`${row.project.id}||${row.stage.id}`}
                  className="timesheet-row grid"
                  style={{ gridTemplateColumns: '1fr repeat(5, 80px) 72px 36px', borderBottom: `1px solid ${BORDER}` }}>
                  <div className="px-4 py-3 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.project.color || TEAL }}/>
                      <span className="text-sm font-medium truncate" style={{ color: INK }}>{row.project.name}</span>
                      {clientLabel(row.project.client) && <span className="text-xs truncate hidden sm:block" style={{ color: `${INK}50` }}>({clientLabel(row.project.client)})</span>}
                    </div>
                    <div className="text-xs mt-0.5 pl-4 truncate" style={{ color: `${INK}50` }}>{row.stage.name}</div>
                  </div>
                  {workDays.map(d => {
                    const ds = formatDate(d)
                    const entry = row.entries[ds]
                    const initVal = entry ? hoursToDisplay(entry.hours) : ''
                    return (
                      <div key={ds} className="flex items-center justify-center px-1" style={{ borderLeft: `1px solid ${BORDER}`, background: isToday(d) ? 'rgba(74,140,122,0.04)' : undefined }}>
                        <input type="text" className={clsx('hours-input', initVal && 'has-value')}
                          defaultValue={initVal} placeholder="—" title={entry?.notes || ''}
                          onFocus={e => e.target.select()}
                          onChange={e => handleCellChange(row.project.id, row.stage.id, ds, e.target.value)} />
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-center" style={{ borderLeft: `1px solid ${BORDER}` }}>
                    <span className="text-sm font-mono font-medium" style={{ color: rowTotal > 0 ? TEAL_DARK : `${INK}25` }}>
                      {rowTotal > 0 ? hoursToDisplay(rowTotal) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <button onClick={() => removeRow(row.project.id, row.stage.id)}
                      className="row-actions w-6 h-6 rounded flex items-center justify-center text-sm transition-colors"
                      style={{ color: `${INK}30` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626'; (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = `${INK}30`; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>×</button>
                  </div>
                </div>
              )
            })
          )}

          <div className="grid" style={{ gridTemplateColumns: '1fr repeat(5, 80px) 72px 36px', borderTop: `1px solid ${BORDER}`, background: CREAM }}>
            <div className="px-4 py-3">
              <button onClick={() => setShowAddRow(true)}
                className="text-sm font-medium flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors"
                style={{ color: TEAL }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(74,140,122,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                + Add row
              </button>
            </div>
            {dayTotals.map((t, i) => (
              <div key={i} className="py-3 text-center text-sm font-mono font-medium"
                style={{ borderLeft: `1px solid ${BORDER}`, color: t > 0 ? INK : `${INK}30`, background: isToday(workDays[i]) ? 'rgba(74,140,122,0.04)' : undefined }}>
                {t > 0 ? hoursToDisplay(t) : '0'}
              </div>
            ))}
            <div className="py-3 text-center text-sm font-mono font-semibold" style={{ borderLeft: `1px solid ${BORDER}`, color: INK }}>
              {weekTotal > 0 ? hoursToDisplay(weekTotal) : '0'}
            </div>
            <div/>
          </div>
        </div>
        </div>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm" style={{ color: `${INK}60` }}>
              {todayTotal > 0 ? <><span className="font-semibold" style={{ color: INK }}>{hoursToDisplay(todayTotal)}</span> logged</> : 'No time logged'}
            </div>
            <button onClick={() => setShowDayModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: TEAL, color: 'white' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = TEAL_DARK}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = TEAL}>
              + Track time
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
          ) : todayEntries.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <p className="text-sm" style={{ color: `${INK}40` }}>No time logged for this day.</p>
              <p className="text-xs mt-1" style={{ color: `${INK}30` }}>Click "+ Track time" to add an entry.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayEntries.map(e => {
                const proj = projects.find(p => p.id === e.project_id)
                return (
                  <div key={e.id} className="rounded-xl px-5 py-4 flex items-center gap-4 fade-in transition-all"
                    style={{ background: 'white', border: `1px solid ${BORDER}` }}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: proj?.color || TEAL }}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: INK }}>{e.project?.name || 'Unknown'}</div>
                      <div className="text-xs mt-0.5" style={{ color: `${INK}50` }}>{e.stage?.name}</div>
                      {e.notes && <div className="text-xs mt-1 italic" style={{ color: `${INK}50` }}>"{e.notes}"</div>}
                    </div>
                    <div className="text-lg font-mono font-semibold" style={{ color: TEAL_DARK }}>{hoursToDisplay(e.hours)}</div>
                    <button onClick={async () => {
                      await fetch('/api/entries', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) })
                      loadEntries()
                    }} className="text-lg leading-none transition-colors" style={{ color: `${INK}25` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#dc2626'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `${INK}25`}>×</button>
                  </div>
                )
              })}
              <div className="flex justify-end pt-2">
                <div className="text-sm font-mono font-semibold px-4 py-2 rounded-lg"
                  style={{ background: 'white', border: `1px solid ${BORDER}`, color: INK }}>
                  Total: {hoursToDisplay(todayTotal)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal shared styles */}
      {(showAddRow || showDayModal) && (
        <div className="fixed inset-0 flex items-center justify-center z-50 fade-in"
          style={{ background: 'rgba(26,26,26,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAddRow(false); setShowDayModal(false) } }}>
          <div className="rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" style={{ background: 'white', border: `1px solid ${BORDER}` }}>

            {showAddRow && <>
              <h3 className="text-sm font-semibold mb-5 tracking-wide" style={{ color: INK }}>Add row to timesheet</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>Project</label>
                  <select value={addRowProject} onChange={e => { setAddRowProject(e.target.value); setAddRowStage('') }}
                    className={inputCls} style={inputStyle}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{clientLabel(p.client) ? `${clientLabel(p.client)} — ` : ''}{p.name}</option>)}
                  </select>
                </div>
                {addRowProject && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>Stage</label>
                    <select value={addRowStage} onChange={e => setAddRowStage(e.target.value)}
                      className={inputCls} style={inputStyle}>
                      <option value="">Select stage…</option>
                      {availableStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={confirmAddRow} disabled={!addRowProject || !addRowStage}
                  className="flex-1 h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ background: TEAL, color: 'white' }}>Add row</button>
                <button onClick={() => setShowAddRow(false)}
                  className="flex-1 h-10 rounded-xl text-sm font-medium transition-colors"
                  style={{ border: `1px solid ${BORDER}`, color: `${INK}80` }}>Cancel</button>
              </div>
            </>}

            {showDayModal && <>
              <h3 className="text-sm font-semibold tracking-wide" style={{ color: INK }}>New time entry</h3>
              <p className="text-xs mb-5 mt-0.5" style={{ color: `${INK}50` }}>{format(currentDate, 'EEEE, d MMMM yyyy')}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>Project</label>
                  <select value={dayEntry.projectId} onChange={e => setDayEntry(d => ({ ...d, projectId: e.target.value, stageId: '' }))}
                    className={inputCls} style={inputStyle}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{clientLabel(p.client) ? `${clientLabel(p.client)} — ` : ''}{p.name}</option>)}
                  </select>
                </div>
                {dayEntry.projectId && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>Stage</label>
                    <select value={dayEntry.stageId} onChange={e => setDayEntry(d => ({ ...d, stageId: e.target.value }))}
                      className={inputCls} style={inputStyle}>
                      <option value="">Select stage…</option>
                      {dayModalStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>Time spent</label>
                  <input type="text" value={dayEntry.hours} onChange={e => setDayEntry(d => ({ ...d, hours: e.target.value }))}
                    placeholder="e.g. 4, 2.5, half a day"
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>
                    Notes <span className="normal-case font-normal" style={{ color: `${INK}35` }}>(optional)</span>
                  </label>
                  <input type="text" value={dayEntry.notes} onChange={e => setDayEntry(d => ({ ...d, notes: e.target.value }))}
                    placeholder="What did you work on?"
                    className={inputCls} style={inputStyle}
                    onKeyDown={e => e.key === 'Enter' && saveDayEntry()} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={saveDayEntry} disabled={!dayEntry.projectId || !dayEntry.stageId || !dayEntry.hours}
                  className="flex-1 h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ background: TEAL, color: 'white' }}>Save entry</button>
                <button onClick={() => setShowDayModal(false)}
                  className="flex-1 h-10 rounded-xl text-sm font-medium transition-colors"
                  style={{ border: `1px solid ${BORDER}`, color: `${INK}80` }}>Cancel</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
