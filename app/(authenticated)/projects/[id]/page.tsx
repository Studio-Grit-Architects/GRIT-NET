'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Project, Stage, TeamMember, ProjectMember, Task, PlanningApplication, StageDeliverable, DeliverableTemplate } from '@/types'


const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  planning:    { label: 'Planning',    color: '#7C6F3E', bg: '#FFF8E1' },
  in_progress: { label: 'In progress', color: '#2E6B52', bg: '#E8F5EE' },
  paused:      { label: 'Paused',      color: '#8B5E3C', bg: '#FFF0E6' },
  completed:   { label: 'Completed',   color: '#4A5568', bg: '#EDF2F7' },
}

const TASK_COLS = [
  { id: 'not_started', label: 'Not started', color: '#6B7280' },
  { id: 'in_progress', label: 'In progress', color: '#2E6B52' },
  { id: 'done',        label: 'Done',        color: '#4A5568' },
]

// ── Gantt chart ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function addMonths(date: Date, n: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

interface GanttRow {
  id: string
  label: string
  type: 'stage' | 'task'
  start: Date
  end: Date
  color: string
  stageName?: string
  notes?: string
  status?: string
  fee?: string
}

interface TooltipState {
  row: GanttRow
  x: number
  y: number
}

const TASK_STATUS_COLOR: Record<string, string> = {
  not_started: '#6B7280',
  in_progress: '#2E6B52',
  done: '#4A5568',
}

function GanttChart({ project, tasks }: { project: Project & { stages: Stage[] }; tasks: Task[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const projectColor = project.color || TEAL

  // Build rows: each stage followed by its tasks (grouped)
  const rows: GanttRow[] = []

  for (const stage of project.stages) {
    const start = parseDate(stage.start_date) || parseDate(project.start_date)
    const end = parseDate(stage.end_date) || parseDate(project.end_date)
    if (start && end) {
      rows.push({ id: stage.id, label: stage.name, type: 'stage', start, end, color: projectColor, fee: stage.fee > 0 ? `£${Number(stage.fee).toLocaleString()}` : undefined })
    }
    for (const task of tasks.filter(t => t.stage_id === stage.id)) {
      const ts = parseDate(task.start_date), te = parseDate(task.due_date)
      if (ts && te) rows.push({ id: task.id, label: task.title, type: 'task', start: ts, end: te, color: projectColor, stageName: stage.name, notes: task.notes || undefined, status: task.status })
    }
  }
  // Tasks not linked to any stage
  for (const task of tasks.filter(t => !t.stage_id)) {
    const ts = parseDate(task.start_date), te = parseDate(task.due_date)
    if (ts && te) rows.push({ id: task.id, label: task.title, type: 'task', start: ts, end: te, color: projectColor, notes: task.notes || undefined, status: task.status })
  }

  // Date range
  let rangeStart: Date, rangeEnd: Date
  if (rows.length > 0) {
    const minDate = rows.reduce((m, r) => r.start < m ? r.start : m, rows[0].start)
    const maxDate = rows.reduce((m, r) => r.end > m ? r.end : m, rows[0].end)
    rangeStart = startOfMonth(addMonths(minDate, -1))
    rangeEnd = startOfMonth(addMonths(maxDate, 1))
  } else {
    rangeStart = startOfMonth(addMonths(today, -2))
    rangeEnd = startOfMonth(addMonths(today, 4))
  }

  const months: { label: string; date: Date }[] = []
  let cur = new Date(rangeStart)
  while (cur <= rangeEnd) {
    months.push({ label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }), date: new Date(cur) })
    cur = addMonths(cur, 1)
  }

  const totalDays = (rangeEnd.getTime() - rangeStart.getTime()) / 86400000
  const dayOffset = (d: Date) => (d.getTime() - rangeStart.getTime()) / 86400000
  const pct = (d: Date) => `${(dayOffset(d) / totalDays * 100).toFixed(3)}%`
  const pctWidth = (s: Date, e: Date) => `${((dayOffset(e) - dayOffset(s)) / totalDays * 100).toFixed(3)}%`
  const todayPct = today >= rangeStart && today <= rangeEnd ? dayOffset(today) / totalDays * 100 : null

  const ROW_H = 40
  const LABEL_W = 210

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center" style={{ color: `${INK}40` }}>
          <p className="text-sm mb-1">No dated items yet</p>
          <p className="text-xs">Add start and due dates to stages and tasks to see them on the timeline</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>

            {/* Month header */}
            <div className="flex" style={{ borderBottom: `2px solid ${BORDER}` }}>
              <div className="flex-shrink-0 px-4 py-2.5"
                style={{ width: LABEL_W, background: CREAM, borderRight: `1px solid ${BORDER}` }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}35` }}>Item</span>
              </div>
              <div className="relative flex-1" style={{ background: CREAM }}>
                <div className="flex h-full">
                  {months.map((m, i) => (
                    <div key={m.label} className="flex-1 px-3 py-2.5 text-xs font-semibold"
                      style={{ color: `${INK}45`, borderLeft: i > 0 ? `1px solid ${BORDER}` : undefined, minWidth: 0, whiteSpace: 'nowrap' }}>
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rows */}
            {rows.map((row) => {
              const isStage = row.type === 'stage'
              return (
                <div key={row.id} className="flex group/row"
                  style={{ height: ROW_H, borderBottom: `1px solid ${BORDER}`, background: isStage ? `${CREAM}55` : 'white' }}>

                  {/* Label column */}
                  <div className="flex-shrink-0 flex items-center gap-2 px-3"
                    style={{ width: LABEL_W, borderRight: `1px solid ${BORDER}` }}>
                    {!isStage && <div style={{ width: 12, flexShrink: 0 }} />}
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: isStage ? row.color : `rgba(${hexToRgb(row.color)},0.35)`,
                               border: isStage ? 'none' : `1.5px solid rgba(${hexToRgb(row.color)},0.5)` }} />
                    <span className="text-xs truncate flex-1"
                      style={{ color: isStage ? INK : `${INK}65`,
                               fontWeight: isStage ? 600 : 400 }}
                      title={row.label}>
                      {row.label}
                    </span>
                    {isStage && row.fee && (
                      <span className="text-xs font-mono flex-shrink-0 ml-1" style={{ color: TEAL_DARK }}>{row.fee}</span>
                    )}
                    {!isStage && row.status && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: TASK_STATUS_COLOR[row.status] ?? `${INK}30` }} />
                    )}
                  </div>

                  {/* Bar area */}
                  <div className="relative flex-1">
                    {/* Month grid lines */}
                    {months.map((m, i) => i > 0 && (
                      <div key={m.label} className="absolute top-0 bottom-0"
                        style={{ left: pct(m.date), width: 1, background: BORDER }} />
                    ))}

                    {/* Today line + label */}
                    {todayPct !== null && (
                      <>
                        <div className="absolute top-0 bottom-0 z-10"
                          style={{ left: `${todayPct.toFixed(3)}%`, width: 1.5, background: TEAL, opacity: 0.55 }} />
                        {rows[0] === row && (
                          <div className="absolute top-0 z-10 px-1 py-0.5 rounded-b text-xs font-medium"
                            style={{ left: `calc(${todayPct.toFixed(3)}% + 4px)`, background: TEAL, color: 'white', fontSize: 9, lineHeight: '14px' }}>
                            Today
                          </div>
                        )}
                      </>
                    )}

                    {/* Bar */}
                    <button
                      className="absolute top-1/2 -translate-y-1/2 transition-all hover:brightness-110"
                      style={{
                        left: pct(row.start),
                        width: pctWidth(row.start, row.end),
                        height: isStage ? 18 : 11,
                        background: isStage ? row.color : `rgba(${hexToRgb(row.color)},0.28)`,
                        borderRadius: isStage ? 5 : 4,
                        border: isStage ? 'none' : `1.5px solid rgba(${hexToRgb(row.color)},0.45)`,
                        minWidth: 6,
                        boxShadow: isStage ? `0 1px 3px rgba(${hexToRgb(row.color)},0.3)` : 'none',
                      }}
                      onMouseEnter={e => setTooltip({ row, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={e => setTooltip(t => t?.row.id === row.id ? null : { row, x: e.clientX, y: e.clientY })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none rounded-xl shadow-2xl"
          style={{ left: tooltip.x + 14, top: tooltip.y - 12, background: 'white', border: `1px solid ${BORDER}`, minWidth: 200, maxWidth: 260,
                   padding: '10px 14px' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: tooltip.row.type === 'stage' ? tooltip.row.color : `rgba(${hexToRgb(tooltip.row.color)},0.5)` }} />
            <p className="text-xs font-semibold leading-snug" style={{ color: INK }}>{tooltip.row.label}</p>
          </div>
          <p className="text-xs mb-1" style={{ color: `${INK}55` }}>
            {tooltip.row.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            <span style={{ color: `${INK}30` }}> → </span>
            {tooltip.row.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {tooltip.row.fee && (
            <p className="text-xs font-mono font-medium" style={{ color: TEAL_DARK }}>{tooltip.row.fee}</p>
          )}
          {tooltip.row.stageName && (
            <p className="text-xs mt-1" style={{ color: `${INK}40` }}>Stage: {tooltip.row.stageName}</p>
          )}
          {tooltip.row.notes && (
            <p className="text-xs mt-1 italic" style={{ color: `${INK}40` }}>{tooltip.row.notes}</p>
          )}
          {tooltip.row.status && (
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full capitalize"
              style={{ background: `${TASK_STATUS_COLOR[tooltip.row.status] ?? INK}15`, color: TASK_STATUS_COLOR[tooltip.row.status] ?? INK }}>
              {tooltip.row.status.replace('_', ' ')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Planning Applications ─────────────────────────────────────────────────────

const APP_TYPES = [
  'Full Planning',
  'Householder',
  'Listed Building Consent',
  'Prior Approval',
  'Section 73',
  'Conditions Discharge',
  'Other',
]

const APP_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  'Preparing':        { label: 'Preparing',        color: '#7C6F3E', bg: '#FFF8E1' },
  'Submitted':        { label: 'Submitted',         color: '#2563EB', bg: '#EFF6FF' },
  'Pending Decision': { label: 'Pending Decision',  color: '#7C3AED', bg: '#F5F3FF' },
  'Approved':         { label: 'Approved',          color: '#2E6B52', bg: '#E8F5EE' },
  'Refused':          { label: 'Refused',           color: '#DC2626', bg: '#FEF2F2' },
  'Appealing':        { label: 'Appealing',         color: '#8B5E3C', bg: '#FFF0E6' },
  'Withdrawn':        { label: 'Withdrawn',         color: '#4A5568', bg: '#EDF2F7' },
}

const EMPTY_APP_FORM = {
  application_type: APP_TYPES[0],
  reference_number: '',
  submission_date: '',
  status: 'Preparing',
  notes: '',
}

function PlanningTab({
  apps,
  onAdd,
  onEdit,
  onDelete,
}: {
  apps: PlanningApplication[]
  onAdd: () => void
  onEdit: (app: PlanningApplication) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}40` }}>
          Planning Applications
        </span>
        <button
          onClick={onAdd}
          className="h-7 px-3 rounded-lg text-xs font-medium transition-colors"
          style={{ background: TEAL, color: 'white' }}
        >
          + Add application
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm" style={{ color: `${INK}40` }}>
          No planning applications yet. Click &ldquo;Add application&rdquo; to track one.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {['Type', 'Reference', 'Submitted', 'Status', 'Notes', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest"
                    style={{ color: `${INK}40`, background: 'white', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((app, idx) => {
                const statusCfg = APP_STATUSES[app.status] ?? { label: app.status, color: INK, bg: CREAM }
                return (
                  <tr key={app.id} style={{ borderBottom: idx < apps.length - 1 ? `1px solid ${BORDER}` : undefined, background: idx % 2 === 0 ? 'white' : `${CREAM}50` }}>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: INK, whiteSpace: 'nowrap' }}>
                      {app.application_type}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: app.reference_number ? `${INK}70` : `${INK}25` }}>
                      {app.reference_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: app.submission_date ? `${INK}60` : `${INK}25`, whiteSpace: 'nowrap' }}>
                      {app.submission_date
                        ? new Date(app.submission_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                        style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs" style={{ color: `${INK}55` }}>
                      <span className="line-clamp-2">{app.notes || ''}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => onEdit(app)}
                          className="h-6 px-2.5 rounded-lg text-xs transition-colors"
                          style={{ border: `1px solid ${BORDER}`, color: `${INK}50`, background: 'white' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(app.id)}
                          className="h-6 px-2.5 rounded-lg text-xs transition-colors"
                          style={{ border: `1px solid #fca5a5`, color: '#dc2626', background: '#fef2f2' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<(Project & { stages: Stage[]; client?: any }) | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)
  const [addingTask, setAddingTask] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([])
  const [newTaskStage, setNewTaskStage] = useState('')
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [editTaskData, setEditTaskData] = useState<Partial<Task>>({})
  const [showEditProject, setShowEditProject] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [activeTab, setActiveTab] = useState<'kanban' | 'timeline' | 'planning'>('kanban')
  const [newTaskStartDate, setNewTaskStartDate] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [addTaskError, setAddTaskError] = useState('')
  const [planningApps, setPlanningApps] = useState<PlanningApplication[]>([])
  const [showAddApp, setShowAddApp] = useState(false)
  const [appForm, setAppForm] = useState<typeof EMPTY_APP_FORM>(EMPTY_APP_FORM)
  const [editingApp, setEditingApp] = useState<PlanningApplication | null>(null)
  const [addMemberInput, setAddMemberInput] = useState({ memberId: '', rate: '' })
  const [stageInput, setStageInput] = useState('')
  const [editProjectForm, setEditProjectForm] = useState<any>({})
  const [clients, setClients] = useState<any[]>([])
  const [deliverables, setDeliverables] = useState<StageDeliverable[]>([])
  const [templates, setTemplates] = useState<DeliverableTemplate[]>([])
  const [newDeliverableInputs, setNewDeliverableInputs] = useState<Record<string, string>>({})
  const [projectEntries, setProjectEntries] = useState<Array<{ stage_id: string; member_id: string; hours: number }>>([])

  async function load() {
    setLoading(true)
    const [projRes, tasksRes, membersRes, pmRes, clientsRes, appsRes, delivRes, tmplRes, entriesRes] = await Promise.all([
      fetch('/api/projects'),
      fetch(`/api/tasks?project_id=${projectId}`),
      fetch('/api/members'),
      fetch(`/api/project-members?project_id=${projectId}`),
      fetch('/api/clients'),
      fetch(`/api/planning-applications?project_id=${projectId}`),
      fetch(`/api/stage-deliverables?project_id=${projectId}`),
      fetch('/api/deliverable-templates'),
      fetch(`/api/entries?project_id=${projectId}`),
    ])
    const projs = await projRes.json()
    setProject(projs.find((p: any) => p.id === projectId) || null)
    setTasks(await tasksRes.json())
    setTeamMembers(await membersRes.json())
    setProjectMembers(await pmRes.json())
    setClients(await clientsRes.json())
    const appsData = await appsRes.json()
    setPlanningApps(Array.isArray(appsData) ? appsData : [])
    const delivData = await delivRes.json()
    setDeliverables(Array.isArray(delivData) ? delivData : [])
    const tmplData = await tmplRes.json()
    setTemplates(Array.isArray(tmplData) ? tmplData : [])
    const entriesData = await entriesRes.json()
    setProjectEntries(Array.isArray(entriesData) ? entriesData.map((e: any) => ({ stage_id: e.stage_id, member_id: e.member_id, hours: e.hours })) : [])
    setLoading(false)
  }

  useEffect(() => { if (projectId) load() }, [projectId])

  async function addTask(status: string) {
    if (!newTaskTitle.trim()) return
    setAddTaskError('')
    const r = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, title: newTaskTitle.trim(), status, assignee_id: newTaskAssignees[0] || null, assignee_ids: newTaskAssignees, stage_id: newTaskStage || null, notes: '', start_date: newTaskStartDate || null, due_date: newTaskDueDate || null })
    })
    const task = await r.json()
    if (!r.ok) {
      setAddTaskError(task?.error?.message ?? 'Failed to create task.')
      return
    }
    setTasks(prev => [...prev, task])
    setNewTaskTitle(''); setNewTaskAssignees([]); setNewTaskStage(''); setNewTaskStartDate(''); setNewTaskDueDate(''); setAddingTask(null); setAddTaskError('')
  }

  async function moveTask(taskId: string, newStatus: string) {
    const r = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskId, status: newStatus }) })
    if (!r.ok) { alert('Failed to move task. Please try again.'); return }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  async function deleteTask(taskId: string) {
    const r = await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskId }) })
    if (!r.ok) { alert('Failed to delete task. Please try again.'); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  async function saveTask() {
    if (!editingTask) return
    const r = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingTask, ...editTaskData }) })
    if (!r.ok) { alert('Failed to save task. Please try again.'); return }
    const updated = await r.json()
    setTasks(prev => prev.map(t => t.id === editingTask ? updated : t))
    setEditingTask(null); setEditTaskData({})
  }

  async function saveApp() {
    const payload = {
      project_id: projectId,
      application_type: appForm.application_type,
      reference_number: appForm.reference_number || null,
      submission_date: appForm.submission_date || null,
      status: appForm.status,
      notes: appForm.notes || null,
    }
    const r = await fetch('/api/planning-applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) { alert('Failed to add planning application. Please try again.'); return }
    const app = await r.json()
    setPlanningApps(prev => [...prev, app])
    setShowAddApp(false)
    setAppForm(EMPTY_APP_FORM)
  }

  async function updateApp() {
    if (!editingApp) return
    const payload = {
      id: editingApp.id,
      application_type: appForm.application_type,
      reference_number: appForm.reference_number || null,
      submission_date: appForm.submission_date || null,
      status: appForm.status,
      notes: appForm.notes || null,
    }
    const r = await fetch('/api/planning-applications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) { alert('Failed to update planning application. Please try again.'); return }
    const updated = await r.json()
    setPlanningApps(prev => prev.map(a => a.id === updated.id ? updated : a))
    setEditingApp(null)
    setAppForm(EMPTY_APP_FORM)
  }

  async function deleteApp(id: string) {
    if (!confirm('Delete this planning application?')) return
    const r = await fetch('/api/planning-applications', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!r.ok) { alert('Failed to delete planning application. Please try again.'); return }
    setPlanningApps(prev => prev.filter(a => a.id !== id))
  }

  async function updateProjectStatus(status: string) {
    const r = await fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId, status }) })
    if (!r.ok) { alert('Failed to update status. Please try again.'); setEditingStatus(false); return }
    setProject(prev => prev ? { ...prev, status } : prev)
    setEditingStatus(false)
  }

  async function saveProject() {
    const r = await fetch('/api/projects', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, ...editProjectForm })
    })
    if (!r.ok) { alert('Failed to save project. Please try again.'); return }
    setProject(prev => prev ? { ...prev, ...editProjectForm } : prev)
    setShowEditProject(false)
  }

  async function addProjectMember() {
    if (!addMemberInput.memberId) return
    const r = await fetch('/api/project-members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, member_id: addMemberInput.memberId, hourly_rate: parseFloat(addMemberInput.rate) || 0 })
    })
    if (!r.ok) { alert('Failed to add team member. Please try again.'); return }
    const pm = await r.json()
    setProjectMembers(prev => [...prev, pm])
    setAddMemberInput({ memberId: '', rate: '' })
  }

  async function updateMemberRate(pmId: string, rate: string) {
    const r = await fetch('/api/project-members', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pmId, hourly_rate: parseFloat(rate) || 0 }) })
    if (!r.ok) { alert('Failed to update rate. Please try again.'); return }
    setProjectMembers(prev => prev.map(pm => pm.id === pmId ? { ...pm, hourly_rate: parseFloat(rate) || 0 } : pm))
  }

  async function removeProjectMember(pmId: string) {
    const r = await fetch('/api/project-members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pmId }) })
    if (!r.ok) { alert('Failed to remove team member. Please try again.'); return }
    setProjectMembers(prev => prev.filter(pm => pm.id !== pmId))
  }

  async function addStage() {
    if (!stageInput.trim()) return
    const r = await fetch('/api/projects/stages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, name: stageInput.trim(), billable: true, fee: 0 })
    })
    if (!r.ok) { alert('Failed to add stage. Please try again.'); return }
    const stage = await r.json()
    setProject(prev => prev ? { ...prev, stages: [...prev.stages, stage] } : prev)
    setStageInput('')
  }

  async function toggleStage(stage: any) {
    const r = await fetch('/api/projects/stages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: stage.id, completed: !stage.completed }) })
    if (!r.ok) { alert('Failed to update stage. Please try again.'); return }
    setProject(prev => prev ? { ...prev, stages: prev.stages.map((s: any) => s.id === stage.id ? { ...s, completed: !s.completed } : s) } : prev)
  }

  async function updateStageFee(stageId: string, fee: string) {
    const numFee = parseFloat(fee) || 0
    const r = await fetch('/api/projects/stages', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stageId, fee: numFee }),
    })
    if (!r.ok) { alert('Failed to update stage fee. Please try again.'); return }
    setProject(prev => prev ? { ...prev, stages: prev.stages.map((s: any) => s.id === stageId ? { ...s, fee: numFee } : s) } : prev)
  }

  async function toggleStageBillingField(stageId: string, field: 'invoiced' | 'paid', current: boolean) {
    const next = !current
    const r = await fetch('/api/projects/stages', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stageId, [field]: next }),
    })
    if (!r.ok) { alert('Failed to update billing field. Please try again.'); return }
    setProject(prev => prev ? { ...prev, stages: prev.stages.map((s: any) => s.id === stageId ? { ...s, [field]: next } : s) } : prev)
  }

  async function addDeliverable(stageId: string) {
    const title = (newDeliverableInputs[stageId] || '').trim()
    if (!title) return
    const r = await fetch('/api/stage-deliverables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId, title, completed: false }),
    })
    if (!r.ok) { alert('Failed to add deliverable. Please try again.'); return }
    const d = await r.json()
    setDeliverables(prev => [...prev, d])
    setNewDeliverableInputs(prev => ({ ...prev, [stageId]: '' }))
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

  async function applyTemplateToStage(templateId: string, stageId: string) {
    const r = await fetch('/api/deliverable-templates/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, stage_id: stageId }),
    })
    const newDelivs = await r.json()
    if (Array.isArray(newDelivs)) setDeliverables(prev => [...prev, ...newDelivs])
  }

  async function archiveProject() {
    if (!confirm('Archive this project?')) return
    await fetch('/api/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projectId }) })
    router.push('/projects')
  }

  if (loading) return <div className="text-center py-20 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
  if (!project) return <div className="text-center py-20 text-sm" style={{ color: `${INK}40` }}>Project not found.</div>

  const completed = project.stages.filter(s => s.completed).length
  const total = project.stages.length
  const pct = total > 0 ? Math.round(completed / total * 100) : 0
  const clientName = project.client?.name || ''
  const statusCfg = STATUS_CONFIG[project.status || 'in_progress']
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length

  return (
    <div>
      {/* Kanban board */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Project header card */}
        <div className="rounded-xl px-4 py-4 mb-5" style={{ background: 'white', border: `1px solid ${BORDER}` }}>

          {/* Row 1: back + status + actions */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <button onClick={() => router.push('/projects')}
              className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
              style={{ color: `${INK}50`, background: CREAM }}>
              ← Back
            </button>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="relative">
                <button onClick={() => isAdmin && setEditingStatus(!editingStatus)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}>
                  {statusCfg.label}{isAdmin ? ' ▾' : ''}
                </button>
                {editingStatus && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setEditingStatus(false)}/>
                    <div className="absolute right-0 top-8 rounded-xl overflow-hidden shadow-xl z-20" style={{ background: 'white', border: `1px solid ${BORDER}`, minWidth: '140px' }}>
                      {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                        <button key={v} onClick={() => updateProjectStatus(v)}
                          className="w-full px-4 py-2.5 text-xs text-left hover:opacity-70"
                          style={{ background: c.bg, color: c.color }}>{c.label}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {isAdmin && (
                <>
                  <button onClick={() => setShowPanel(!showPanel)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ border: `1px solid ${showPanel ? TEAL : BORDER}`, color: showPanel ? TEAL : `${INK}60`, background: showPanel ? 'rgba(74,140,122,0.06)' : 'white' }}>
                    {showPanel ? 'Hide details' : 'Details'}
                  </button>
                  <button onClick={() => { setEditProjectForm({ name: project.name, code: project.code, client_id: project.client_id || '', project_type: project.project_type, start_date: project.start_date || '', end_date: project.end_date || '', notes: project.notes || '', color: project.color }); setShowEditProject(true) }}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ border: `1px solid ${BORDER}`, color: `${INK}60` }}>
                    Edit
                  </button>
                  <button onClick={archiveProject}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ border: `1px solid ${BORDER}`, color: `${INK}40` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626'; (e.currentTarget as HTMLElement).style.borderColor = '#fca5a5' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = `${INK}40`; (e.currentTarget as HTMLElement).style.borderColor = BORDER }}>
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: colour dot + name + code */}
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: project.color }}/>
            <span className="font-semibold text-sm" style={{ color: INK }}>{project.name}</span>
            {project.code && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: CREAM, color: `${INK}50` }}>{project.code}</span>}
          </div>

          {/* Row 3: client */}
          {clientName && <div className="text-xs mb-2 pl-4" style={{ color: `${INK}40` }}>{clientName}</div>}

          {/* Row 4: progress + dates + avatars */}
          <div className="flex items-center gap-4 flex-wrap pl-4">
            {project.start_date && (
              <span className="text-xs" style={{ color: `${INK}50` }}>
                📅 {project.start_date}{project.end_date ? ` → ${project.end_date}` : ''}
              </span>
            )}
            {total > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: `${INK}40` }}>Stages</span>
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: '#e8e5de' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TEAL }}/>
                </div>
                <span className="text-xs font-mono" style={{ color: `${INK}50` }}>{completed}/{total}</span>
              </div>
            )}
            {totalTasks > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: `${INK}40` }}>Tasks</span>
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: '#e8e5de' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(doneTasks/totalTasks*100)}%`, background: '#5B8DB8' }}/>
                </div>
                <span className="text-xs font-mono" style={{ color: `${INK}50` }}>{doneTasks}/{totalTasks}</span>
              </div>
            )}
            {projectMembers.length > 0 && (
              <div className="flex -space-x-1">
                {projectMembers.map(pm => (
                  <div key={pm.id} className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white"
                    style={{ background: 'rgba(74,140,122,0.15)', color: TEAL_DARK }} title={pm.member?.name}>
                    {pm.member?.name?.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Team & Stages Panel */}
        {showPanel && (
          <div className="rounded-xl p-5 mb-5 grid grid-cols-2 gap-6" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            {/* Stages */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: `${INK}40` }}>Stages</div>
              {project.stages.length === 0 ? (
                <p className="text-xs mb-2" style={{ color: `${INK}30` }}>No stages yet</p>
              ) : (
                <div className="mb-3 space-y-1">
                  {project.stages.map((stage: any) => {
  const stageDeliverables = deliverables.filter(d => d.stage_id === stage.id)

  return (
    <div key={stage.id} className="py-1.5">
      <div className="flex items-center gap-2">
                      <input type="checkbox" checked={stage.completed} onChange={() => toggleStage(stage)}
                        className="w-4 h-4 flex-shrink-0" style={{ accentColor: TEAL }} />
                      <span className="text-sm flex-1" style={{ color: stage.completed ? `${INK}35` : INK, textDecoration: stage.completed ? 'line-through' : undefined }}>{stage.name}</span>
                      {isAdmin ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs" style={{ color: `${INK}40` }}>£</span>
                            <input
                              type="number" defaultValue={stage.fee || ''} placeholder="0" min="0"
                              className="w-20 h-7 px-2 rounded-lg text-xs text-right focus:outline-none"
                              style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}
                              onBlur={e => updateStageFee(stage.id, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && updateStageFee(stage.id, (e.target as HTMLInputElement).value)}
                            />
                            </div>

      {stageDeliverables.length > 0 && (
        <div className="ml-6 mt-2 space-y-1">
          {stageDeliverables.map(d => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={d.completed}
                onChange={e => toggleDeliverable(d.id, e.target.checked)}
                className="w-3 h-3"
                style={{ accentColor: TEAL }}
              />
                          <button
                            onClick={() => toggleStageBillingField(stage.id, 'invoiced', !!stage.invoiced)}
                            className="h-6 px-2 rounded-full text-xs font-medium transition-all"
                            style={stage.invoiced
                              ? { background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }
                              : { background: CREAM, color: `${INK}35`, border: `1px solid ${BORDER}` }}
                          >
                            Invoiced
                          </button>
                          <button
                            onClick={() => toggleStageBillingField(stage.id, 'paid', !!stage.paid)}
                            className="h-6 px-2 rounded-full text-xs font-medium transition-all"
                            style={stage.paid
                              ? { background: '#E8F5EE', color: '#2E6B52', border: '1px solid #A7D7C5' }
                              : { background: CREAM, color: `${INK}35`, border: `1px solid ${BORDER}` }}
                          >
                            Paid
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {stage.fee > 0 && <span className="text-xs font-mono" style={{ color: TEAL_DARK }}>£{Number(stage.fee).toLocaleString()}</span>}
                          {stage.invoiced && <span className="h-5 px-1.5 rounded-full text-xs" style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>Invoiced</span>}
                          {stage.paid && <span className="h-5 px-1.5 rounded-full text-xs" style={{ background: '#E8F5EE', color: '#2E6B52', border: '1px solid #A7D7C5' }}>Paid</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isAdmin && (
                <div className="flex gap-2">
                  <input value={stageInput} onChange={e => setStageInput(e.target.value)}
                    placeholder="Add stage…" className="flex-1 h-8 px-3 rounded-lg text-xs focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}
                    onKeyDown={e => e.key === 'Enter' && addStage()} />
                  <button onClick={addStage} className="h-8 px-3 rounded-lg text-xs" style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white' }}>+ Add</button>
                </div>
              )}
            </div>

            {/* Team */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: `${INK}40` }}>Team & Rates</div>
              {projectMembers.length === 0 ? (
                <p className="text-xs mb-2" style={{ color: `${INK}30` }}>No team members assigned</p>
              ) : (
                <div className="mb-3 space-y-2">
                  {projectMembers.map(pm => (
                    <div key={pm.id} className="flex items-center gap-2 group">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ background: 'rgba(74,140,122,0.1)', color: TEAL_DARK }}>
                        {pm.member?.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm flex-1" style={{ color: INK }}>{pm.member?.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: `${INK}40` }}>£</span>
                        <input type="number" defaultValue={pm.hourly_rate || ''} placeholder="0" min="0"
                          className="w-16 h-7 px-2 rounded-lg text-xs text-right focus:outline-none"
                          style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}
                          onBlur={e => updateMemberRate(pm.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && updateMemberRate(pm.id, (e.target as HTMLInputElement).value)}
                          disabled={!isAdmin} />
                        <span className="text-xs" style={{ color: `${INK}40` }}>/hr</span>
                      </div>
                      {isAdmin && (
                        <button onClick={() => removeProjectMember(pm.id)} className="opacity-0 group-hover:opacity-100 text-xs w-4" style={{ color: `${INK}30` }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#dc2626'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `${INK}30`}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isAdmin && (
                <div className="flex gap-2 flex-wrap">
                  <select value={addMemberInput.memberId} onChange={e => setAddMemberInput(f => ({ ...f, memberId: e.target.value }))}
                    className="flex-1 h-8 px-2 rounded-lg text-xs focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}>
                    <option value="">Add member…</option>
                    {teamMembers.filter(m => !projectMembers.find(pm => pm.member_id === m.id)).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: `${INK}40` }}>£</span>
                    <input type="number" value={addMemberInput.rate} onChange={e => setAddMemberInput(f => ({ ...f, rate: e.target.value }))}
                      placeholder="rate" min="0" className="w-16 h-8 px-2 rounded-lg text-xs focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }} />
                    <span className="text-xs" style={{ color: `${INK}40` }}>/hr</span>
                  </div>
                  <button onClick={addProjectMember} className="h-8 px-3 rounded-lg text-xs" style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white' }}>+ Add</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: CREAM }}>
          {([
            { id: 'kanban',   label: 'Board' },
            { id: 'timeline', label: 'Timeline' },
            { id: 'planning', label: 'Planning', count: planningApps.length },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
              style={{ background: activeTab === tab.id ? 'white' : 'transparent', color: activeTab === tab.id ? INK : `${INK}50`, boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {tab.label}
              {'count' in tab && tab.count > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                  style={{ background: activeTab === tab.id ? CREAM : 'transparent', color: `${INK}50` }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'timeline' && (
          <GanttChart project={project} tasks={tasks} />
        )}


        {activeTab === 'planning' && (
          <PlanningTab
            apps={planningApps}
            onAdd={() => { setAppForm(EMPTY_APP_FORM); setEditingApp(null); setShowAddApp(true) }}
            onEdit={app => { setEditingApp(app); setAppForm({ application_type: app.application_type, reference_number: app.reference_number ?? '', submission_date: app.submission_date ?? '', status: app.status, notes: app.notes ?? '' }); setShowAddApp(true) }}
            onDelete={deleteApp}
          />
        )}

        {activeTab === 'kanban' && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TASK_COLS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id)
            return (
              <div key={col.id}>
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }}/>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-xs ml-auto" style={{ color: `${INK}30` }}>{colTasks.length}</span>
                </div>

                <div className="space-y-2">
                  {colTasks.map(task => (
                    <div key={task.id} className="rounded-xl p-3.5 group transition-all"
                      style={{ background: 'white', border: `1px solid ${BORDER}` }}>
                      {editingTask === task.id ? (
                        <div className="space-y-2">
                          <input value={editTaskData.title ?? task.title}
                            onChange={e => setEditTaskData(d => ({ ...d, title: e.target.value }))}
                            className="w-full text-sm px-2 py-1.5 rounded-lg focus:outline-none"
                            style={{ border: `1px solid ${TEAL}`, background: CREAM }} autoFocus />
                          <textarea value={editTaskData.notes ?? task.notes}
                            onChange={e => setEditTaskData(d => ({ ...d, notes: e.target.value }))}
                            placeholder="Notes…" className="w-full text-xs px-2 py-1.5 rounded-lg focus:outline-none resize-none"
                            style={{ border: `1px solid ${BORDER}`, background: CREAM, height: '64px' }} />
                          <div>
                            <p className="text-xs mb-1" style={{ color: `${INK}40` }}>Assignees</p>
                            <div className="flex flex-wrap gap-1.5">
                              {teamMembers.map(m => {
                                const ids = editTaskData.assignee_ids ?? task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])
                                const selected = ids.includes(m.id)
                                return (
                                  <button key={m.id} type="button"
                                    onClick={() => {
                                      const cur = editTaskData.assignee_ids ?? task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])
                                      const next = cur.includes(m.id) ? cur.filter((id: string) => id !== m.id) : [...cur, m.id]
                                      setEditTaskData(d => ({ ...d, assignee_ids: next, assignee_id: next[0] || null }))
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all"
                                    style={{ background: selected ? TEAL : CREAM, color: selected ? 'white' : `${INK}60`, border: `1px solid ${selected ? TEAL : BORDER}` }}>
                                    <span>{m.name.charAt(0).toUpperCase()}</span>
                                    <span>{m.name.split(' ')[0]}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-xs mb-0.5 block" style={{ color: `${INK}40` }}>Start date</label>
                              <input type="date" value={editTaskData.start_date ?? task.start_date ?? ''}
                                onChange={e => setEditTaskData(d => ({ ...d, start_date: e.target.value || null }))}
                                className="w-full h-8 px-2 rounded-lg text-xs focus:outline-none"
                                style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                            </div>
                            <div>
                              <label className="text-xs mb-0.5 block" style={{ color: `${INK}40` }}>Due date</label>
                              <input type="date" value={editTaskData.due_date ?? task.due_date ?? ''}
                                onChange={e => setEditTaskData(d => ({ ...d, due_date: e.target.value || null }))}
                                className="w-full h-8 px-2 rounded-lg text-xs focus:outline-none"
                                style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={saveTask} className="flex-1 h-7 rounded-lg text-xs font-medium" style={{ background: TEAL, color: 'white' }}>Save</button>
                            <button onClick={() => { setEditingTask(null); setEditTaskData({}) }} className="flex-1 h-7 rounded-lg text-xs" style={{ border: `1px solid ${BORDER}`, color: `${INK}60` }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm leading-snug" style={{ color: INK }}>{task.title}</p>
                            <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                              <button onClick={() => { setEditingTask(task.id); setEditTaskData({}) }}
                                className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
                                style={{ color: `${INK}40`, background: CREAM }}>✎</button>
                              <button onClick={() => deleteTask(task.id)}
                                className="w-6 h-6 rounded flex items-center justify-center text-xs transition-colors"
                                style={{ color: '#dc2626', background: '#fef2f2' }}>×</button>
                            </div>
                          </div>
                          {task.notes && <p className="text-xs mt-1.5 italic" style={{ color: `${INK}45` }}>{task.notes}</p>}
                          {task.stage && <span className="text-xs mt-1 inline-block px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,140,122,0.08)', color: '#3a7062' }}>{task.stage.name}</span>}
                          <div className="flex items-center justify-between mt-2.5">
                            {(() => {
                              const ids = task.assignee_ids?.length ? task.assignee_ids : (task.assignee_id ? [task.assignee_id] : [])
                              const assignees = ids.map((id: string) => teamMembers.find(m => m.id === id)).filter(Boolean)
                              return assignees.length > 0 ? (
                                <div className="flex items-center">
                                  {assignees.slice(0, 3).map((m: any, idx: number) => (
                                    <div key={m.id}
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
                                      style={{ background: 'rgba(74,140,122,0.1)', color: TEAL_DARK, marginLeft: idx > 0 ? -4 : 0, border: '1.5px solid white' }}
                                      title={m.name}>
                                      {m.name.charAt(0).toUpperCase()}
                                    </div>
                                  ))}
                                  {assignees.length > 3 && (
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
                                      style={{ background: CREAM, color: `${INK}50`, marginLeft: -4, border: '1.5px solid white' }}>
                                      +{assignees.length - 3}
                                    </div>
                                  )}
                                </div>
                              ) : <div/>
                            })()}
                            {/* Move buttons */}
                            <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              {TASK_COLS.filter(c => c.id !== col.id).map(c => (
                                <button key={c.id} onClick={() => moveTask(task.id, c.id)}
                                  className="text-xs px-2 py-0.5 rounded-full transition-colors"
                                  style={{ background: CREAM, color: `${INK}50` }}>
                                  → {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add task */}
                  {addingTask === col.id ? (
                    <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'white', border: `1px solid ${TEAL}` }}>
                      <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                        placeholder="Task title…" className="w-full text-sm px-2 py-1.5 rounded-lg focus:outline-none"
                        style={{ border: `1px solid ${BORDER}`, background: CREAM }}
                        onKeyDown={e => e.key === 'Enter' && addTask(col.id)} autoFocus />
                      <div className="flex flex-wrap gap-1.5">
                        {teamMembers.map(m => {
                          const selected = newTaskAssignees.includes(m.id)
                          return (
                            <button key={m.id} type="button"
                              onClick={() => setNewTaskAssignees(prev => selected ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all"
                              style={{ background: selected ? TEAL : CREAM, color: selected ? 'white' : `${INK}60`, border: `1px solid ${selected ? TEAL : BORDER}` }}>
                              <span>{m.name.charAt(0).toUpperCase()}</span>
                              <span>{m.name.split(' ')[0]}</span>
                            </button>
                          )
                        })}
                      </div>
                      {project.stages.length > 0 && (
                        <select value={newTaskStage} onChange={e => setNewTaskStage(e.target.value)}
                          className="w-full h-8 px-2 rounded-lg text-xs focus:outline-none"
                          style={{ border: `1px solid ${BORDER}`, background: CREAM }}>
                          <option value="">No stage</option>
                          {project.stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-xs mb-0.5 block" style={{ color: `${INK}40` }}>Start date</label>
                          <input type="date" value={newTaskStartDate} onChange={e => setNewTaskStartDate(e.target.value)}
                            className="w-full h-8 px-2 rounded-lg text-xs focus:outline-none"
                            style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                        </div>
                        <div>
                          <label className="text-xs mb-0.5 block" style={{ color: `${INK}40` }}>Due date</label>
                          <input type="date" value={newTaskDueDate} onChange={e => setNewTaskDueDate(e.target.value)}
                            className="w-full h-8 px-2 rounded-lg text-xs focus:outline-none"
                            style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                        </div>
                      </div>
                      {addTaskError && (
                        <p className="text-xs px-1" style={{ color: '#dc2626' }}>{addTaskError}</p>
                      )}
                      <div className="flex gap-1.5">
                        <button onClick={() => addTask(col.id)} className="flex-1 h-7 rounded-lg text-xs font-medium" style={{ background: TEAL, color: 'white' }}>Add</button>
                        <button onClick={() => { setAddingTask(null); setNewTaskTitle(''); setNewTaskAssignees([]); setNewTaskStage(''); setNewTaskStartDate(''); setNewTaskDueDate(''); setAddTaskError('') }}
                          className="flex-1 h-7 rounded-lg text-xs" style={{ border: `1px solid ${BORDER}`, color: `${INK}60` }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTask(col.id)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-xl transition-all"
                      style={{ color: `${INK}30`, border: `1px dashed ${BORDER}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TEAL; (e.currentTarget as HTMLElement).style.borderColor = TEAL; (e.currentTarget as HTMLElement).style.background = 'rgba(74,140,122,0.03)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = `${INK}30`; (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      + New task
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>}
      </div>
      {/* Planning Application Modal */}
      {showAddApp && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(26,26,26,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAddApp(false); setEditingApp(null) } }}>
          <div className="rounded-2xl p-6 w-full max-w-lg mx-4 shadow-xl" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            <h3 className="text-sm font-semibold mb-5" style={{ color: INK }}>
              {editingApp ? 'Edit application' : 'Add planning application'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Application type</label>
                  <select value={appForm.application_type} onChange={e => setAppForm(f => ({ ...f, application_type: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }}>
                    {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Reference number</label>
                  <input value={appForm.reference_number} onChange={e => setAppForm(f => ({ ...f, reference_number: e.target.value }))}
                    placeholder="e.g. 24/01234/FUL"
                    className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Submission date</label>
                  <input type="date" value={appForm.submission_date} onChange={e => setAppForm(f => ({ ...f, submission_date: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Status</label>
                  <select value={appForm.status} onChange={e => setAppForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: CREAM }}>
                    {Object.keys(APP_STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Notes</label>
                  <textarea value={appForm.notes} onChange={e => setAppForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Conditions, officer name, appeal details…"
                    className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
                    style={{ border: `1px solid ${BORDER}`, background: CREAM, height: '80px' }} />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={editingApp ? updateApp : saveApp}
                  className="flex-1 h-10 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>
                  {editingApp ? 'Save changes' : 'Add application'}
                </button>
                <button onClick={() => { setShowAddApp(false); setEditingApp(null); setAppForm(EMPTY_APP_FORM) }}
                  className="flex-1 h-10 rounded-xl text-sm" style={{ border: `1px solid ${BORDER}`, color: `${INK}70` }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProject && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(26,26,26,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowEditProject(false) }}>
          <div className="rounded-2xl p-6 w-full max-w-lg mx-4 shadow-xl overflow-y-auto" style={{ background: 'white', border: `1px solid ${BORDER}`, maxHeight: '90vh' }}>
            <h3 className="text-sm font-semibold mb-5 tracking-wide" style={{ color: INK }}>Edit project</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project name</label>
                <input value={editProjectForm.name || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, name: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project code</label>
                <input value={editProjectForm.code || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, code: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Client</label>
                <select value={editProjectForm.client_id || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, client_id: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}>
                  <option value="">— No client —</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Project type</label>
                <select value={editProjectForm.project_type || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, project_type: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }}>
                  <option value="time_materials">Time & Materials</option>
                  <option value="fixed_fee">Fixed Fee</option>
                  <option value="non_billable">Non-Billable</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Start date</label>
                <input type="date" value={editProjectForm.start_date || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, start_date: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>End date</label>
                <input type="date" value={editProjectForm.end_date || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, end_date: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl text-sm focus:outline-none" style={{ border: `1px solid ${BORDER}`, background: '#EEECE6' }} />
              </div>
              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Notes</label>
                <textarea value={editProjectForm.notes || ''} onChange={e => setEditProjectForm((f: any) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none"
                  style={{ border: `1px solid ${BORDER}`, background: '#EEECE6', height: '72px' }} />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: `${INK}50` }}>Colour</label>
                <div className="flex gap-2 flex-wrap">
                  {['#4A8C7A','#5B8DB8','#9B7FB6','#C4714A','#B8A84A','#7A6E9B','#C25C7A','#4A7A8C'].map(c => (
                    <button key={c} onClick={() => setEditProjectForm((f: any) => ({ ...f, color: c }))}
                      className="w-6 h-6 rounded-full" style={{ background: c, outline: editProjectForm.color === c ? `2px solid ${c}` : undefined, outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={saveProject} className="flex-1 h-10 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>Save changes</button>
              <button onClick={() => setShowEditProject(false)} className="flex-1 h-10 rounded-xl text-sm" style={{ border: `1px solid ${BORDER}`, color: `${INK}70` }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
