'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getWeekDays, formatDate, hoursToDisplay } from '@/lib/dates'
import { format, subDays, parseISO } from 'date-fns'
import type { Project, Stage, TimeEntry } from '@/types'
import { clientLabel } from '@/types'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

interface Task {
  id: string
  project_id: string
  title: string
  notes: string
  status: string
  assignee_id: string | null
  stage_id: string | null
  due_date: string | null
  position: number
  assignee?: { id: string; name: string }
  stage?: { id: string; name: string }
  project?: { id: string; name: string; color: string }
}

interface MemberHours {
  memberId: string
  name: string
  hours: number
}

// ── Studio Chat ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatContext {
  userName: string
  activeProjects: Array<{ id: string; name: string; code?: string; status: string; stagesCompleted: number; stagesTotal: number; stages: Array<{ id: string; name: string }> }>
  recentEntries: Array<{ project: string; stage: string; hours: number; date: string }>
  teamMembers: Array<{ id: string; name: string }>
}

function StudioChat({ context }: { context: ChatContext }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [open, messages])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setStreaming(true)

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setMessages([...next, assistantMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context }),
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: accumulated }
          return copy
        })
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all"
        style={{ background: TEAL, color: 'white' }}
        title="Studio assistant"
        aria-label="Open chat">
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 3a1 1 0 011-1h14a1 1 0 011 1v10a1 1 0 01-1 1H6l-4 4V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: 'min(360px, calc(100vw - 2rem))', height: 520, background: 'white', border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
            <div className="w-2 h-2 rounded-full" style={{ background: TEAL }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Studio Assistant</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-center pt-8" style={{ color: `${INK}35` }}>
                Ask about your projects, time logs, or anything studio-related.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                  style={m.role === 'user'
                    ? { background: TEAL, color: 'white' }
                    : { background: CREAM, color: INK }}>
                  {m.content || (streaming && i === messages.length - 1 ? (
                    <span className="inline-block w-1.5 h-3.5 rounded-sm animate-pulse" style={{ background: `${INK}30` }} />
                  ) : '')}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex-shrink-0 flex gap-2 px-3 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl px-3 py-2 text-sm focus:outline-none"
              style={{ border: `1px solid ${BORDER}`, background: CREAM, color: INK, maxHeight: 100, overflowY: 'auto' }} />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity"
              style={{ background: TEAL, color: 'white', opacity: !input.trim() || streaming ? 0.4 : 1 }}
              aria-label="Send">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7h12M7 1l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, count, action }: { title: string; count?: number | string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>{title}</span>
      <span className="text-xs" style={{ color: `${INK}35` }}>{action ?? count}</span>
    </div>
  )
}

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  color?: string
}

function WeekCalendar({ tasks: initialTasks, weekDays }: { tasks: Task[]; weekDays: Date[] }) {
  const router = useRouter()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  useEffect(() => {
    const timeMin = weekDays[0].toISOString()
    const timeMax = new Date(weekDays[6].getTime() + 86400000).toISOString()
    fetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.events)) setCalEvents(d.events) })
      .catch(() => {})
  }, [])

  function handleDrop(dateStr: string) {
    if (!draggingId) return
    setDragOver(null)
    const prevTasks = tasks
    setTasks(prev => prev.map(t => t.id === draggingId ? { ...t, due_date: dateStr } : t))
    fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draggingId, due_date: dateStr }),
    }).then(r => { if (!r.ok) setTasks(prevTasks) }).catch(() => setTasks(initialTasks))
    setDraggingId(null)
  }

  // Tasks with a due_date go on that day; unscheduled tasks go on today
  const scheduled = tasks.filter(t => t.due_date)
  const unscheduled = tasks.filter(t => !t.due_date)
  const inProgress = unscheduled.filter(t => t.status === 'in_progress')
  const notStarted = unscheduled.filter(t => t.status !== 'in_progress')
  const todayUnscheduled = [...inProgress, ...notStarted]

  const displayDays = weekDays.slice(0, 5)

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
      <SectionHeader title="My Week" count={tasks.length ? `${tasks.length} tasks` : undefined} />
      <div className="grid grid-cols-5">
        {displayDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === todayStr
          const isWeekend = i >= 5
          const isDragTarget = dragOver === dateStr
          const dayScheduled = scheduled.filter(t => t.due_date === dateStr)
          const dayTasks = isToday
            ? [...dayScheduled, ...todayUnscheduled]
            : dayScheduled
          const dayEvents = calEvents.filter(e => e.start?.slice(0, 10) === dateStr)

          return (
            <div key={dateStr} className="flex flex-col"
              style={{ borderRight: i < 4 ? `1px solid ${BORDER}` : undefined, minHeight: 130 }}
              onDragOver={e => { e.preventDefault(); setDragOver(dateStr) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(dateStr)}>
              {/* Day header */}
              <div className="px-1 py-2 text-center flex-shrink-0"
                style={{ borderBottom: `1px solid ${BORDER}`, background: isToday ? TEAL : CREAM }}>
                <div className="text-xs uppercase tracking-wider"
                  style={{ color: isToday ? 'rgba(255,255,255,0.75)' : `${INK}45` }}>
                  {format(day, 'EEE')}
                </div>
                <div className="text-sm font-semibold font-mono mt-0.5"
                  style={{ color: isToday ? 'white' : isWeekend ? `${INK}35` : INK }}>
                  {format(day, 'd')}
                </div>
              </div>

              {/* Events + Tasks */}
              <div className="flex-1 p-1.5 space-y-1 overflow-hidden"
                style={{
                  background: isDragTarget ? `${TEAL}08` : isWeekend ? '#fafaf8' : 'white',
                  transition: 'background 0.1s',
                  outline: isDragTarget ? `2px dashed ${TEAL}40` : undefined,
                  outlineOffset: -2,
                }}>
                {/* Google Calendar events */}
                {dayEvents.map(ev => (
                  <div key={ev.id} className="px-1.5 py-1 rounded text-xs leading-snug"
                    style={{
                      background: ev.color ? `${ev.color}18` : 'rgba(91,141,184,0.08)',
                      borderLeft: `2px solid ${ev.color || '#5B8DB8'}`,
                    }}>
                    <div className="font-medium leading-tight truncate" style={{ color: INK, fontSize: 10 }}>
                      {ev.title}
                    </div>
                    {!ev.allDay && (
                      <div style={{ color: `${INK}40`, fontSize: 9 }}>
                        {format(parseISO(ev.start), 'HH:mm')}
                      </div>
                    )}
                  </div>
                ))}
                {/* Tasks — draggable + clickable */}
                {dayTasks.map(task => (
                  <div key={task.id}
                    draggable
                    onDragStart={() => setDraggingId(task.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOver(null) }}
                    onClick={() => router.push(`/projects/${task.project_id}`)}
                    className="px-1.5 py-1 rounded text-xs leading-snug"
                    style={{
                      background: task.status === 'in_progress' ? `${TEAL}12` : `${INK}06`,
                      borderLeft: `2px solid ${task.status === 'in_progress' ? TEAL : `${INK}20`}`,
                      cursor: 'pointer',
                      opacity: draggingId === task.id ? 0.4 : 1,
                    }}>
                    <div className="font-medium leading-tight"
                      style={{ color: INK, fontSize: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {task.title}
                    </div>
                    {task.project && (
                      <div className="truncate mt-0.5" style={{ color: `${INK}40`, fontSize: 9 }}>
                        {task.project.name}
                      </div>
                    )}
                  </div>
                ))}
                {dayTasks.length === 0 && dayEvents.length === 0 && (
                  <div className="flex items-center justify-center h-full py-4">
                    <span style={{ fontSize: 10, color: `${INK}18` }}>—</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function TaskList({ tasks, title }: { tasks: Task[]; title: string }) {
  const router = useRouter()
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
      <SectionHeader title={title} count={tasks.length || undefined} />
      {tasks.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm" style={{ color: `${INK}40` }}>All caught up!</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {tasks.slice(0, 12).map((task, i) => (
              <div key={task.id}
                className="px-5 py-3 flex items-start gap-3 cursor-pointer"
                style={{
                  borderBottom: i < Math.min(tasks.length, 12) - 1 ? `1px solid ${BORDER}` : undefined,
                  borderRight: i % 2 === 0 && tasks.length > 1 ? `1px solid ${BORDER}` : undefined,
                  background: 'white',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf8'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
                onClick={() => router.push(`/projects/${task.project_id}`)}>
                <div className="w-3.5 h-3.5 mt-0.5 rounded border-2 flex-shrink-0"
                  style={{ borderColor: task.status === 'in_progress' ? TEAL : `${INK}20` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug" style={{ color: INK }}>{task.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {task.project && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: task.project.color || TEAL }} />
                        <span className="text-xs truncate" style={{ color: `${INK}45` }}>{task.project.name}</span>
                      </>
                    )}
                    {task.stage && (
                      <span className="text-xs" style={{ color: `${INK}30` }}>· {task.stage.name}</span>
                    )}
                  </div>
                </div>
                {task.status === 'in_progress' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'rgba(74,140,122,0.08)', color: TEAL_DARK }}>
                    Active
                  </span>
                )}
              </div>
            ))}
          </div>
          {tasks.length > 12 && (
            <div className="px-5 py-2.5 text-center" style={{ borderTop: `1px solid ${BORDER}`, background: CREAM }}>
              <span className="text-xs" style={{ color: `${INK}40` }}>+{tasks.length - 12} more tasks</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const { data: session } = useSession()
  const memberId = session?.user?.memberId
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'
  const isDirector = session?.user?.isDirector
  const router = useRouter()

  const [projects, setProjects] = useState<(Project & { stages: Stage[] })[]>([])
  const [teamEntries, setTeamEntries] = useState<TimeEntry[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myEntries, setMyEntries] = useState<TimeEntry[]>([])
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([])
  const [teamTasks, setTeamTasks] = useState<Array<{ memberId: string; name: string; tasks: Task[] }>>([])
  const [loading, setLoading] = useState(true)

  interface DigestThread {
    projectId: string; projectName: string; projectColor: string
    subject: string; subjectSuffix: string; snippet: string
    lastSender: string; lastDate: string; daysSince: number
    messageCount: number; awaitingReply: boolean; gmailLink: string
  }
  const [digestThreads,    setDigestThreads]    = useState<DigestThread[]>([])
  const [digestState,      setDigestState]      = useState<'loading' | 'ok' | 'no_token' | 'error'>('loading')
  const [digestFetchedAt,  setDigestFetchedAt]  = useState<Date | null>(null)
  const [digestWeekStart,  setDigestWeekStart]  = useState<string | null>(null)
  const [digestRefreshing, setDigestRefreshing] = useState(false)

  const now = new Date()
  const weekDays = getWeekDays(now)
  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])

  useEffect(() => {
    if (!memberId) return
    const threeWeeksAgo = formatDate(subDays(now, 21))
    Promise.all([
      fetch('/api/projects'),
      fetch(`/api/reports?from=${weekStart}&to=${weekEnd}`),
      fetch(`/api/tasks?assignee_id=${memberId}`),
      fetch(`/api/entries?member_id=${memberId}&week_start=${threeWeeksAgo}&week_end=${weekEnd}`),
      fetch('/api/members'),
    ]).then(async ([projRes, teamRes, tasksRes, entriesRes, membersRes]) => {
      const projData = projRes.ok ? await projRes.json() : []
      setProjects(Array.isArray(projData) ? projData : [])
      // teamRes returns 403 for non-admins — guard before using
      const teamData = teamRes.ok ? await teamRes.json() : []
      setTeamEntries(Array.isArray(teamData) ? teamData : [])
      const tasksData = tasksRes.ok ? await tasksRes.json() : []
      setMyTasks(Array.isArray(tasksData) ? tasksData.filter((t: Task) => t.status !== 'done') : [])
      const entriesData = entriesRes.ok ? await entriesRes.json() : []
      setMyEntries(Array.isArray(entriesData) ? entriesData : [])
      const members = membersRes.ok ? await membersRes.json() : []
      setTeamMembers(Array.isArray(members) ? members.map((m: any) => ({ id: m.id, name: m.name })) : [])
      if (isDirector && Array.isArray(members)) {
        const results = await Promise.all(
          members
            .filter((m: any) => m.id !== memberId)
            .map((m: any) =>
              fetch(`/api/tasks?assignee_id=${m.id}`)
                .then(r => r.ok ? r.json() : [])
                .then((tasks: any[]) => ({
                  memberId: m.id,
                  name: m.name,
                  tasks: Array.isArray(tasks) ? tasks.filter((t: Task) => t.status !== 'done') : [],
                }))
            )
        )
        setTeamTasks(results)
      }
      setLoading(false)
    }).catch(() => setLoading(false))

    // Email digest — fetched separately, non-blocking
    fetchDigest()
  }, [memberId])

  function fetchDigest(isRefresh = false) {
    if (isRefresh) setDigestRefreshing(true)
    fetch('/api/gmail/digest')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.threads)) setDigestThreads(d.threads)
        setDigestState(d.error === 'no_token' ? 'no_token' : 'ok')
        if (d.fetchedAt) setDigestFetchedAt(new Date(d.fetchedAt))
        if (d.weekStart) setDigestWeekStart(d.weekStart)
      })
      .catch(() => setDigestState('error'))
      .finally(() => setDigestRefreshing(false))
  }

  // Auto-refresh digest every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchDigest(true), 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const memberHours: MemberHours[] = Object.values(
    teamEntries.reduce<Record<string, MemberHours>>((acc, e) => {
      if (!e.member) return acc
      if (!acc[e.member_id]) acc[e.member_id] = { memberId: e.member_id, name: e.member.name, hours: 0 }
      acc[e.member_id].hours += e.hours
      return acc
    }, {})
  ).sort((a, b) => b.hours - a.hours)

  const totalTeamHours = memberHours.reduce((s, m) => s + m.hours, 0)
  const maxMemberHours = Math.max(...memberHours.map(m => m.hours), 0.01)

  const activeProjects = projects.filter(p => p.status !== 'completed')

  const recentEntries = [...myEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (!session) return null

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold" style={{ color: INK }}>{greeting}, {firstName}</h1>
          <p className="text-xs mt-0.5" style={{ color: `${INK}45` }}>{format(now, 'EEEE, d MMMM yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/checkin"
            className="text-sm px-4 py-2 rounded-xl font-medium transition-colors"
            style={{ background: CREAM, color: INK, border: `1px solid ${BORDER}` }}>
            Log time
          </Link>
          <Link href="/log-task"
            className="text-sm px-4 py-2 rounded-xl font-medium transition-colors"
            style={{ background: TEAL, color: 'white' }}>
            Log task
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : (
        <div className="space-y-4">

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Team hours this week', value: hoursToDisplay(totalTeamHours) || '0h', accent: true },
              { label: 'Active projects',       value: activeProjects.length.toString() },
              { label: 'My open tasks',         value: myTasks.length.toString() },
            ].map(card => (
              <div key={card.label} className="rounded-xl px-5 py-4" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: `${INK}45` }}>{card.label}</div>
                <div className="text-2xl font-semibold font-mono" style={{ color: card.accent ? TEAL_DARK : INK }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* My Open Tasks */}
          <TaskList tasks={myTasks} title="My Open Tasks" />

          {/* My Week calendar */}
          <WeekCalendar tasks={myTasks} weekDays={weekDays} />

          {/* Director: per-member open tasks */}
          {isDirector && teamTasks.map(group => (
            <TaskList key={group.memberId} tasks={group.tasks} title={`${group.name.split(' ')[0]}'s Tasks`} />
          ))}

          {/* Email Digest */}
          {(() => {
            const awaiting = digestThreads.filter(t => t.awaitingReply)
            const replied  = digestThreads.filter(t => !t.awaitingReply)
            const weekLabel = digestWeekStart
              ? (() => {
                  const d = new Date(digestWeekStart)
                  const end = new Date(d); end.setDate(d.getDate() + 6)
                  const fmt = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  return `${fmt(d)} – ${fmt(end)}`
                })()
              : ''
            const minsAgo = digestFetchedAt
              ? Math.floor((Date.now() - digestFetchedAt.getTime()) / 60000)
              : null

            const ThreadRow = ({ t, last }: { t: DigestThread; last: boolean }) => {
              const isLate = t.awaitingReply && t.daysSince >= 5
              const isWarning = t.awaitingReply && t.daysSince >= 2 && t.daysSince < 5
              const badgeLabel = t.awaitingReply
                ? (isLate ? `⚠ ${t.daysSince}d` : t.daysSince === 0 ? 'Today' : t.daysSince === 1 ? '1d' : `${t.daysSince}d`)
                : '✓'
              return (
                <a
                  href={t.gmailLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-5 py-2.5"
                  style={{ borderBottom: last ? undefined : `1px solid ${BORDER}`, background: 'white', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf8'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.projectColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: INK }}>{t.projectName}</span>
                      <span className="text-xs truncate" style={{ color: `${INK}45` }}>{t.snippet}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: isLate ? '#fef2f2' : isWarning ? '#fffbeb' : t.awaitingReply ? `${TEAL}10` : `${TEAL}12`,
                      color:      isLate ? '#dc2626' : isWarning ? '#b45309' : TEAL_DARK,
                    }}>
                    {badgeLabel}
                  </span>
                </a>
              )
            }

            return (
              <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Email Digest</span>
                    {weekLabel && <span className="text-xs" style={{ color: `${INK}35` }}>{weekLabel}</span>}
                    {digestState === 'ok' && digestThreads.length > 0 && (
                      <span className="text-xs" style={{ color: `${INK}35` }}>
                        {awaiting.length > 0 ? `${awaiting.length} awaiting reply` : 'All replied ✓'}
                        {' · '}{digestThreads.length} thread{digestThreads.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {minsAgo !== null && (
                      <span className="text-xs" style={{ color: `${INK}30` }}>
                        {minsAgo < 1 ? 'just now' : `${minsAgo}m ago`}
                      </span>
                    )}
                    <button
                      onClick={() => fetchDigest(true)}
                      disabled={digestRefreshing || digestState === 'loading'}
                      title="Refresh"
                      className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-white disabled:opacity-40"
                      style={{ color: `${INK}40` }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: digestRefreshing ? 'rotate(180deg)' : undefined, transition: 'transform 0.4s' }}>
                        <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2c1.2 0 2.3.47 3.1 1.25L11 2v4H7l1.4-1.4A3 3 0 1 0 9.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* States */}
                {digestState === 'loading' && (
                  <div className="px-5 py-4 text-sm" style={{ color: `${INK}40` }}>Checking Gmail…</div>
                )}
                {digestState === 'no_token' && (
                  <div className="px-5 py-4 text-sm" style={{ color: `${INK}40` }}>Sign out and back in to grant Gmail access.</div>
                )}
                {digestState === 'ok' && digestThreads.length === 0 && (
                  <div className="px-5 py-4 text-sm" style={{ color: `${INK}40` }}>No client email activity this week.</div>
                )}

                {/* Awaiting reply */}
                {awaiting.length > 0 && (
                  <>
                    <div className="px-5 py-1" style={{ borderBottom: `1px solid ${BORDER}`, background: '#fef9f9' }}>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#dc2626', opacity: 0.7 }}>Awaiting reply</span>
                    </div>
                    {awaiting.map((t, i) => <ThreadRow key={t.gmailLink} t={t} last={i === awaiting.length - 1 && replied.length === 0} />)}
                  </>
                )}

                {/* Replied */}
                {replied.length > 0 && (
                  <>
                    <div className="px-5 py-1" style={{ borderBottom: `1px solid ${BORDER}`, background: `${TEAL}08` }}>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: TEAL_DARK, opacity: 0.7 }}>Replied</span>
                    </div>
                    {replied.map((t, i) => <ThreadRow key={t.gmailLink} t={t} last={i === replied.length - 1} />)}
                  </>
                )}
              </div>
            )
          })()}

          {/* Active Projects + Recent Entries */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
            {/* Active Projects */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <SectionHeader title="Active Projects" count={activeProjects.length} />
              {activeProjects.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm" style={{ color: `${INK}40` }}>No active projects.</div>
              ) : (
                activeProjects.map((p, i) => {
                  const completed = p.stages.filter(s => s.completed).length
                  const total = p.stages.length
                  const pct = total > 0 ? Math.round(completed / total * 100) : 0
                  const clientName = clientLabel(p.client)
                  return (
                    <div key={p.id}
                      className="px-5 py-3.5 flex items-center gap-4 cursor-pointer"
                      style={{ borderBottom: i < activeProjects.length - 1 ? `1px solid ${BORDER}` : undefined, background: 'white' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf8'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
                      onClick={() => router.push(`/projects/${p.id}`)}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color || TEAL }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.code && (
                            <span className="font-mono text-xs px-1 rounded" style={{ background: CREAM, color: `${INK}40` }}>{p.code}</span>
                          )}
                          <span className="text-sm font-medium" style={{ color: INK }}>{p.name}</span>
                          {clientName && <span className="text-xs" style={{ color: `${INK}40` }}>{clientName}</span>}
                        </div>
                        {total > 0 && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="w-32 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#e8e5de' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color || TEAL }} />
                            </div>
                            <span className="text-xs font-mono" style={{ color: `${INK}35` }}>{completed}/{total} stages</span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-mono font-medium flex-shrink-0"
                        style={{ color: pct === 100 ? TEAL_DARK : `${INK}30` }}>
                        {total > 0 ? `${pct}%` : '—'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {/* Recent Time Entries */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              <SectionHeader
                title="My Recent Entries"
                action={<Link href="/dashboard" className="text-xs" style={{ color: TEAL }}>View all →</Link>}
              />
              {recentEntries.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm" style={{ color: `${INK}40` }}>No entries in the last 3 weeks.</p>
                </div>
              ) : (
                recentEntries.map((e, i) => (
                  <div key={e.id} className="px-5 py-3 flex items-center gap-3"
                    style={{ borderBottom: i < recentEntries.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: e.project?.color || TEAL }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{e.project?.name}</div>
                      <div className="text-xs truncate" style={{ color: `${INK}40` }}>{e.stage?.name}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-mono font-medium" style={{ color: TEAL_DARK }}>{hoursToDisplay(e.hours)}</div>
                      <div className="text-xs font-mono" style={{ color: `${INK}35` }}>
                        {format(parseISO(e.date), 'd MMM')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Team Hours — full width at bottom */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            <SectionHeader
              title="Team This Week"
              action={<span className="font-mono font-medium" style={{ color: TEAL_DARK }}>{hoursToDisplay(totalTeamHours)}</span>}
            />
            {memberHours.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: `${INK}40` }}>No hours logged yet.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px" style={{ background: BORDER }}>
                {memberHours.map(m => (
                  <div key={m.memberId} className="px-5 py-4" style={{ background: 'white' }}>
                    <div className="text-xs truncate mb-2" style={{ color: `${INK}55` }}>{m.name}</div>
                    <div className="text-lg font-semibold font-mono" style={{ color: TEAL_DARK }}>{hoursToDisplay(m.hours)}</div>
                    <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: '#e8e5de' }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${Math.round(m.hours / maxMemberHours * 100)}%`, background: TEAL }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      <StudioChat context={{
        userName: firstName,
        activeProjects: activeProjects.map(p => ({
          id: p.id,
          name: p.name,
          code: p.code || undefined,
          status: p.status,
          stagesCompleted: p.stages.filter(s => s.completed).length,
          stagesTotal: p.stages.length,
          stages: p.stages.map(s => ({ id: s.id, name: s.name })),
        })),
        teamMembers,
        recentEntries: recentEntries.slice(0, 10).map(e => ({
          project: e.project?.name ?? '',
          stage: e.stage?.name ?? '',
          hours: e.hours,
          date: e.date,
        })),
      }} />
    </div>
  )
}
