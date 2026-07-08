'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const TEAL      = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM     = '#EEECE6'
const BORDER    = '#d8d5ce'
const INK       = '#1a1a1a'
const PAGE_BG   = '#F7F6F2'

type TaskStatus = 'not_started' | 'in_progress' | 'done'

interface Stage   { id: string; name: string; position: number }
interface Project {
  id: string; name: string; code: string; color: string
  status: string; archived: boolean
  client?: { id: string; name: string } | null
  stages?: Stage[]
}

interface TaskItem {
  id: string | null
  title: string
  originalStatus: TaskStatus
  newStatus: TaskStatus
  stageId: string | null
  assigneeId: string | null
  isNew: boolean
}

interface Member { id: string; name: string }

interface ProjectWork {
  project: Project
  tasks: TaskItem[]
}

function statusLabel(s: TaskStatus): string {
  if (s === 'not_started') return 'Not started'
  if (s === 'in_progress') return 'In progress'
  return 'Done'
}

function nextStatus(s: TaskStatus): TaskStatus {
  if (s === 'not_started') return 'in_progress'
  if (s === 'in_progress') return 'done'
  return 'not_started'
}

type Screen = 'welcome' | 'project' | 'tasks' | 'summary' | 'done'

export default function LogTaskPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [screen,          setScreen]         = useState<Screen>('welcome')
  const [projects,        setProjects]       = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [taskItems,       setTaskItems]      = useState<TaskItem[]>([])
  const [newTaskTitle,      setNewTaskTitle]      = useState('')
  const [newTaskStageId,    setNewTaskStageId]    = useState<string | null>(null)
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string | null>(null)
  const [members,           setMembers]           = useState<Member[]>([])
  const [work,              setWork]              = useState<ProjectWork[]>([])
  const [submitting,        setSubmitting]        = useState(false)
  const [loadingTasks,      setLoadingTasks]      = useState(false)

  const memberId  = session?.user?.memberId
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: Project[]) => setProjects(data.filter(p => !p.archived && p.status !== 'completed')))
    fetch('/api/members')
      .then(r => r.json())
      .then(setMembers)
      .catch(() => {})
  }, [])

  // Default assignee to self once session is ready
  useEffect(() => {
    if (memberId && newTaskAssigneeId === null) setNewTaskAssigneeId(memberId)
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function selectProject(p: Project) {
    setSelectedProject(p)
    setNewTaskTitle('')
    setNewTaskStageId(null)
    setLoadingTasks(true)
    try {
      const res   = await fetch(`/api/tasks?project_id=${p.id}`)
      const tasks = res.ok ? await res.json() : []
      const open  = Array.isArray(tasks) ? tasks.filter((t: any) => t.status !== 'done') : []
      setTaskItems(open.map((t: any) => ({
        id:             t.id,
        title:          t.title,
        originalStatus: t.status as TaskStatus,
        newStatus:      t.status as TaskStatus,
        stageId:        t.stage_id,
        assigneeId:     null,
        isNew:          false,
      })))
    } catch {
      setTaskItems([])
    } finally {
      setLoadingTasks(false)
    }
    setScreen('tasks')
  }

  function cycleStatus(idx: number) {
    setTaskItems(prev => prev.map((t, i) => i === idx ? { ...t, newStatus: nextStatus(t.newStatus) } : t))
  }

  function addNewTask() {
    const title = newTaskTitle.trim()
    if (!title) return
    setTaskItems(prev => [...prev, {
      id:             null,
      title,
      originalStatus: 'in_progress',
      newStatus:      'in_progress',
      stageId:        newTaskStageId,
      assigneeId:     newTaskAssigneeId,
      isNew:          true,
    }])
    setNewTaskTitle('')
    setNewTaskStageId(null)
    setNewTaskAssigneeId(memberId ?? null)
  }

  function confirmProject() {
    setWork(prev => {
      const existing = prev.findIndex(w => w.project.id === selectedProject!.id)
      if (existing >= 0) {
        return prev.map((w, i) => i === existing ? { ...w, tasks: taskItems } : w)
      }
      return [...prev, { project: selectedProject!, tasks: taskItems }]
    })
    setScreen('summary')
  }

  async function submit() {
    if (!memberId) return
    setSubmitting(true)
    try {
      const promises: Promise<Response>[] = []
      for (const projectWork of work) {
        for (const task of projectWork.tasks) {
          if (task.isNew) {
            promises.push(fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id:  projectWork.project.id,
                title:       task.title,
                status:      task.newStatus,
                assignee_id: task.assigneeId ?? memberId,
                stage_id:    task.stageId,
                notes:       '',
              }),
            }))
          } else if (task.newStatus !== task.originalStatus) {
            promises.push(fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: task.id, status: task.newStatus }),
            }))
          }
        }
      }
      const responses = await Promise.all(promises)
      const failed = responses.filter(r => !r.ok)
      if (failed.length > 0) {
        alert(`${failed.length} task operation(s) failed. Please try again.`)
        return
      }
      setScreen('done')
    } finally {
      setSubmitting(false)
    }
  }

  const card: React.CSSProperties  = { background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }
  const page: React.CSSProperties  = { background: PAGE_BG, minHeight: '100vh', padding: '16px' }
  const shell: React.CSSProperties = { width: '100%', maxWidth: 480, margin: '0 auto' }

  function PageHeader() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '4px 0' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{process.env.NEXT_PUBLIC_FIRM_NAME ?? 'Macronet'}</span>
        <span style={{ fontSize: 12, color: `${INK}60`, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '3px 10px' }}>{todayLabel}</span>
      </div>
    )
  }

  function SectionHeader({ label }: { label: string }) {
    return (
      <div style={{ background: CREAM, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: `${INK}50` }}>{label}</span>
      </div>
    )
  }

  // ── WELCOME ────────────────────────────────────────────────────────────────
  if (screen === 'welcome') return (
    <div style={page}>
      <div style={shell}>
        <PageHeader />
        <div style={card}>
          <SectionHeader label="Log a task" />
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: INK, marginBottom: 8 }}>What did you work on?</div>
            <div style={{ fontSize: 14, color: `${INK}60`, marginBottom: 32 }}>Log new tasks or update existing ones in seconds.</div>
            <button
              onClick={() => setScreen('project')}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '13px 40px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
            >
              Let&apos;s go
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── PROJECT SELECT ─────────────────────────────────────────────────────────
  if (screen === 'project') return (
    <div style={page}>
      <div style={shell}>
        <PageHeader />
        <div style={card}>
          <SectionHeader label="Select project" />
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => selectProject(p)}
                style={{ background: CREAM, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', position: 'relative', transition: 'all 0.15s', userSelect: 'none' as const }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = p.color; (e.currentTarget as HTMLElement).style.background = `${p.color}10` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = BORDER; (e.currentTarget as HTMLElement).style.background = CREAM }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color, borderRadius: '12px 12px 0 0' }} />
                {p.client?.name && <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: `${INK}50`, marginBottom: 4, marginTop: 4 }}>{p.client.name}</div>}
                <div style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '0 4px' }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', fontSize: 13, color: `${INK}50`, cursor: 'pointer', padding: '8px 0' }}>← Back to home</button>
        </div>
      </div>
    </div>
  )

  // ── TASK LIST ──────────────────────────────────────────────────────────────
  if (screen === 'tasks' && selectedProject) {
    const stages = selectedProject.stages || []
    const color  = selectedProject.color || TEAL
    return (
      <div style={page}>
        <div style={shell}>
          <PageHeader />
          <div style={card}>
            <div style={{ height: 3, background: color }} />
            <SectionHeader label={selectedProject.name} />

            {loadingTasks ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: `${INK}40` }}>Loading tasks…</div>
            ) : (
              <>
                {taskItems.length === 0 && (
                  <div style={{ padding: '16px', fontSize: 13, color: `${INK}40`, textAlign: 'center' }}>No open tasks — add one below.</div>
                )}

                {taskItems.map((task, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: INK }}>{task.title}</div>
                      {task.stageId && stages.length > 0 && (
                        <div style={{ fontSize: 11, color: `${INK}40`, marginTop: 2 }}>
                          {stages.find(s => s.id === task.stageId)?.name}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => cycleStatus(i)}
                      style={{
                        flexShrink: 0,
                        padding: '4px 10px',
                        borderRadius: 20,
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        background:
                          task.newStatus === 'done'        ? `${TEAL}15` :
                          task.newStatus === 'in_progress' ? `${color}15` :
                          `${INK}07`,
                        color:
                          task.newStatus === 'done'        ? TEAL_DARK :
                          task.newStatus === 'in_progress' ? color :
                          `${INK}50`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {statusLabel(task.newStatus)}
                    </button>
                  </div>
                ))}

                {/* Add new task */}
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: `${INK}40`, marginBottom: 8 }}>Add a task</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addNewTask()}
                      placeholder="Task title…"
                      style={{ flex: 1, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '0 12px', height: 38, fontSize: 13, color: INK, outline: 'none' }}
                    />
                    <button
                      onClick={addNewTask}
                      disabled={!newTaskTitle.trim()}
                      style={{
                        background: newTaskTitle.trim() ? TEAL : CREAM,
                        color: newTaskTitle.trim() ? 'white' : `${INK}35`,
                        border: `1px solid ${newTaskTitle.trim() ? TEAL : BORDER}`,
                        borderRadius: 10, padding: '0 14px', fontSize: 13, fontWeight: 600,
                        cursor: newTaskTitle.trim() ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {newTaskTitle.trim() && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                      {/* Stage tags */}
                      {stages.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                          {stages.map(s => (
                            <button
                              key={s.id}
                              onClick={() => setNewTaskStageId(prev => prev === s.id ? null : s.id)}
                              style={{
                                background: newTaskStageId === s.id ? TEAL : CREAM,
                                border: `1.5px solid ${newTaskStageId === s.id ? TEAL : BORDER}`,
                                borderRadius: 20, padding: '4px 10px', fontSize: 11,
                                color: newTaskStageId === s.id ? 'white' : INK,
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Assignee */}
                      {members.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: `${INK}50`, flexShrink: 0 }}>Assign to</span>
                          <select
                            value={newTaskAssigneeId ?? ''}
                            onChange={e => setNewTaskAssigneeId(e.target.value || null)}
                            style={{ flex: 1, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '5px 10px', fontSize: 12, color: INK, outline: 'none' }}
                          >
                            <option value="">Unassigned</option>
                            {members.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.id === memberId ? `${m.name} (you)` : m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${BORDER}` }}>
              <button onClick={() => setScreen('project')} style={{ background: 'none', border: 'none', fontSize: 13, color: `${INK}50`, cursor: 'pointer', padding: '8px 0' }}>← Back</button>
              <button
                onClick={confirmProject}
                style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Done →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  if (screen === 'summary') return (
    <div style={page}>
      <div style={shell}>
        <PageHeader />
        <div style={card}>
          <SectionHeader label="Review & Submit" />
          <div style={{ padding: 16 }}>
            {work.map((w, wi) => {
              const changes = w.tasks.filter(t => t.isNew || t.newStatus !== t.originalStatus)
              return (
                <div key={wi} style={{ marginBottom: wi < work.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: w.project.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{w.project.name}</span>
                  </div>
                  {changes.length === 0 ? (
                    <div style={{ fontSize: 12, color: `${INK}40`, paddingLeft: 16 }}>No changes</div>
                  ) : changes.map((task, ti) => (
                    <div key={ti} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: CREAM, borderRadius: 8, marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 13, color: INK, flex: 1, minWidth: 0 }}>{task.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0,
                        color: task.newStatus === 'done' ? TEAL_DARK : task.newStatus === 'in_progress' ? TEAL : `${INK}50` }}>
                        {task.isNew ? 'New · ' : ''}{statusLabel(task.newStatus)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setScreen('project')}
              style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '11px', fontSize: 13, color: `${INK}70`, cursor: 'pointer', fontWeight: 500 }}
            >
              + Add from another project
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '13px', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Saving…' : 'Submit tasks ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── DONE ───────────────────────────────────────────────────────────────────
  const totalChanges = work.reduce((s, w) => s + w.tasks.filter(t => t.isNew || t.newStatus !== t.originalStatus).length, 0)
  return (
    <div style={page}>
      <div style={shell}>
        <PageHeader />
        <div style={card}>
          <div style={{ height: 3, background: TEAL }} />
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: `${TEAL}15`, border: `1.5px solid ${TEAL}30`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginBottom: 8 }}>Tasks updated.</div>
            <div style={{ fontSize: 14, color: `${INK}60`, marginBottom: 28 }}>
              {totalChanges} task{totalChanges !== 1 ? 's' : ''} logged.
            </div>
            <button
              onClick={() => router.push('/')}
              style={{ display: 'block', width: '100%', background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 500, color: `${INK}70`, cursor: 'pointer' }}
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
