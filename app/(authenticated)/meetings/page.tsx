'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import type { Meeting, ProcessingStep, ProcessResult } from '@/lib/meetings/types'
import type { Project, Stage, TeamMember } from '@/types'
import { useRecording } from '@/lib/recording-context'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

const STEPS: { id: ProcessingStep; label: string }[] = [
  { id: 'uploading',   label: 'Uploading' },
  { id: 'reading',     label: 'Reading Transcript' },
  { id: 'summarising', label: 'Summarising' },
  { id: 'done',        label: 'Draft Ready' },
]

const STEP_ORDER: ProcessingStep[] = ['uploading', 'reading', 'summarising', 'done']

function stepIndex(step: ProcessingStep) {
  return STEP_ORDER.indexOf(step)
}

function StatusDot({ state }: { state: 'pending' | 'active' | 'done' }) {
  if (state === 'done') {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: TEAL }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse" style={{ background: TEAL, opacity: 0.85 }}>
        <div className="w-2.5 h-2.5 rounded-full bg-white" />
      </div>
    )
  }
  return <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: '#e8e5de', border: `2px solid ${BORDER}` }} />
}

function Stepper({ step }: { step: ProcessingStep }) {
  const current = stepIndex(step)
  return (
    <div className="flex items-center gap-0 w-full max-w-lg mx-auto py-6">
      {STEPS.map((s, i) => {
        const idx = stepIndex(s.id)
        const state = idx < current ? 'done' : idx === current ? 'active' : 'pending'
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <StatusDot state={state} />
              <span className="text-xs text-center whitespace-nowrap"
                style={{ color: state === 'pending' ? `${INK}30` : state === 'active' ? TEAL : TEAL_DARK, fontWeight: state === 'active' ? 600 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px mx-2 mb-5" style={{ background: idx < current ? TEAL : BORDER }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SpeakerTranscript({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        const match = para.match(/^\*\*(.+?):\*\*\s*([\s\S]*)$/)
        if (match) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-xs font-semibold mt-0.5 flex-shrink-0 whitespace-nowrap" style={{ color: TEAL_DARK }}>{match[1]}:</span>
              <span className="text-sm" style={{ color: INK, lineHeight: '1.7' }}>{match[2].trim()}</span>
            </div>
          )
        }
        return <p key={i} className="text-sm" style={{ color: INK, lineHeight: '1.7' }}>{para}</p>
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: Meeting['status'] }) {
  const map: Record<Meeting['status'], { label: string; bg: string; color: string }> = {
    pending:       { label: 'Pending',    bg: '#f3f2ee',                    color: `${INK}50` },
    processing:    { label: 'Processing', bg: 'rgba(74,140,122,0.08)',      color: TEAL_DARK },
    done:          { label: 'Processed',  bg: 'rgba(74,140,122,0.1)',       color: TEAL_DARK },
    draft_created: { label: 'Draft sent', bg: 'rgba(74,140,122,0.15)',      color: TEAL_DARK },
    error:         { label: 'Error',      bg: '#fef2f2',                    color: '#dc2626' },
  }
  const { label, bg, color } = map[status] ?? map.pending
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: bg, color }}>{label}</span>
}

function ProjectTag({ project }: { project: { id: string; name: string; color: string | null } | null | undefined }) {
  if (!project) return <span className="text-xs" style={{ color: `${INK}30` }}>—</span>
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: project.color || TEAL }} />
      <span className="text-xs truncate" style={{ color: INK }}>{project.name}</span>
    </div>
  )
}

function InlineProjectSelect({
  meetingId,
  currentProjectId,
  projects,
  onUpdated,
}: {
  meetingId: string
  currentProjectId: string | null
  projects: (Project & { stages: Stage[] })[]
  onUpdated: (projectId: string | null, project: { id: string; name: string; color: string | null } | null) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value || null
    setSaving(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: newId }),
      })
      const data = await res.json()
      if (res.ok) {
        onUpdated(data.project_id, data.project ?? null)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={currentProjectId || ''}
      onChange={handleChange}
      disabled={saving}
      className="text-xs rounded-lg px-2 py-1 focus:outline-none max-w-[160px]"
      style={{ border: `1px solid ${BORDER}`, background: 'white', color: INK, opacity: saving ? 0.6 : 1 }}>
      <option value="">— unassigned</option>
      {projects.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

export default function MeetingsPage() {
  const { data: session } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [projects, setProjects] = useState<(Project & { stages: Stage[] })[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [title, setTitle] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const [step, setStep] = useState<ProcessingStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [transcriptExpandedId, setTranscriptExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pastCopied, setPastCopied] = useState<string | null>(null)

  const [pastMeetings, setPastMeetings] = useState<Meeting[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])

  // Per action item: editable title, stage, assignee, and whether it's been added
  interface ActionTask { title: string; stageId: string | null; assigneeId: string; adding: boolean; added: boolean }
  const [actionTasks, setActionTasks] = useState<ActionTask[]>([])
  const [pastActionTasks, setPastActionTasks] = useState<Record<string, ActionTask[]>>({})

  // Recorder state — managed by the layout-level RecordingContext
  const [inputMode, setInputMode] = useState<'upload' | 'record'>('upload')
  const [recordedTranscript, setRecordedTranscript] = useState('')
  const {
    status: recStatus,
    recordingTime,
    blobUrl: recordingBlobUrl,
    error: transcribeError,
    startRecording,
    stopRecording,
    retryTranscription,
    consumeTranscript,
  } = useRecording()
  const requesting   = recStatus === 'requesting'
  const recording    = recStatus === 'recording'
  const transcribing = recStatus === 'transcribing'

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects).catch(() => {})
    fetch('/api/members').then(r => r.json()).then(setMembers).catch(() => {})
    loadPastMeetings()
  }, [])

  // Consume transcript as soon as it's ready — whether the user is already on
  // this page (recStatus transitions to 'ready' while mounted) or navigated back
  // to it (component remounts with recStatus already 'ready').
  useEffect(() => {
    if (recStatus !== 'ready') return
    const t = consumeTranscript()
    if (t) {
      setRecordedTranscript(t)
      setInputMode('record')
    }
  }, [recStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPastMeetings() {
    setListLoading(true)
    const res = await fetch('/api/meetings')
    if (res.ok) setPastMeetings(await res.json())
    setListLoading(false)
  }

  function validateAndSetFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext !== 'docx' && ext !== 'txt') {
      setFileError('Only .docx and .txt files are accepted')
      setFile(null)
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError('File must be under 10MB')
      setFile(null)
      return
    }
    setFile(f)
    setFileError(null)
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }

  function handleReset() {
    setStep('idle'); setError(null); setResult(null); setMeetingId(null)
    setFile(null); setFileError(null); setTitle(''); setRecipientEmail('')
    setSelectedProjectId(''); setIsEditing(false); setCopied(false)
    setLinkedProjectId(null); setRecordedTranscript(''); setActionTasks([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleProcess() {
    const isRecord = inputMode === 'record'
    if (isRecord && !recordedTranscript) return
    if (!isRecord && !file) return
    if (!title.trim()) return

    setError(null); setResult(null); setCopied(false)
    setStep('uploading')

    const t1 = setTimeout(() => setStep('reading'), 900)
    const t2 = setTimeout(() => setStep('summarising'), 2200)

    const formData = new FormData()
    if (isRecord) {
      formData.append('transcriptText', recordedTranscript)
    } else {
      formData.append('file', file!)
    }
    formData.append('title', title.trim())
    formData.append('recipientEmail', recipientEmail.trim())
    if (selectedProjectId) formData.append('projectId', selectedProjectId)

    try {
      const res = await fetch('/api/meetings/process', { method: 'POST', body: formData })
      clearTimeout(t1); clearTimeout(t2)
      const text = await res.text()
      let data: ProcessResult & { error?: string }
      try { data = JSON.parse(text) } catch { throw new Error(`Server error: ${text.slice(0, 200)}`) }
      if (!res.ok) throw new Error(data.error || 'Processing failed')
      setResult(data)
      setMeetingId(data.id)
      setLinkedProjectId(data.suggestedProjectId)
      setEditSubject(data.emailSubject)
      setEditBody(data.emailBody)
      setActionTasks((data.actionItems ?? []).map((title: string) => ({
        title,
        stageId:    null,
        assigneeId: session?.user?.memberId ?? '',
        adding:     false,
        added:      false,
      })))
      setStep('done')
      loadPastMeetings()
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('error')
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setPastMeetings(prev => prev.filter(m => m.id !== id))
      if (expandedId === id) setExpandedId(null)
    } finally {
      setDeletingId(null)
    }
  }

  async function addActionTask(idx: number) {
    const task = actionTasks[idx]
    if (!task.title.trim() || task.added || task.adding) return
    setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, adding: true } : t))
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:  linkedProjectId,
          title:       task.title.trim(),
          status:      'not_started',
          assignee_id: task.assigneeId || null,
          stage_id:    task.stageId || null,
          notes:       '',
        }),
      })
      if (!r.ok) {
        setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, adding: false } : t))
        setError('Failed to add task — please try again')
        return
      }
      setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, adding: false, added: true } : t))
    } catch {
      setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, adding: false } : t))
      setError('Failed to add task — please try again')
    }
  }

  async function addPastActionTask(meetingId: string, projectId: string | null, idx: number) {
    const task = pastActionTasks[meetingId]?.[idx]
    if (!task || !task.title.trim() || task.added || task.adding) return
    setPastActionTasks(prev => ({
      ...prev,
      [meetingId]: prev[meetingId].map((t, i) => i === idx ? { ...t, adding: true } : t),
    }))
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:  projectId,
          title:       task.title.trim(),
          status:      'not_started',
          assignee_id: task.assigneeId || null,
          stage_id:    task.stageId || null,
          notes:       '',
        }),
      })
      if (!r.ok) {
        setPastActionTasks(prev => ({
          ...prev,
          [meetingId]: prev[meetingId].map((t, i) => i === idx ? { ...t, adding: false } : t),
        }))
        return
      }
      setPastActionTasks(prev => ({
        ...prev,
        [meetingId]: prev[meetingId].map((t, i) => i === idx ? { ...t, adding: false, added: true } : t),
      }))
    } catch {
      setPastActionTasks(prev => ({
        ...prev,
        [meetingId]: prev[meetingId].map((t, i) => i === idx ? { ...t, adding: false } : t),
      }))
    }
  }

  async function handlePastCopy(m: Meeting) {
    const text = `Subject: ${m.email_subject}\n\n${m.email_body}`
    await navigator.clipboard.writeText(text)
    setPastCopied(m.id)
    setTimeout(() => setPastCopied(null), 2000)
  }

  async function handleCopy() {
    const text = `Subject: ${editSubject}\n\n${editBody}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!session) return null

  const processing = step !== 'idle' && step !== 'done' && step !== 'error'
  const canProcess = (
    (inputMode === 'upload' && !!file) ||
    (inputMode === 'record' && !!recordedTranscript)
  ) && title.trim().length > 0 && !processing && !transcribing
  const linkedProject = projects.find(p => p.id === linkedProjectId) ?? null

  const inputCls = "w-full h-10 px-3 rounded-xl text-sm focus:outline-none"
  const inputStyle = { border: `1px solid ${BORDER}`, background: 'white', color: INK }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-base font-semibold" style={{ color: INK }}>Meeting Summaries</h1>
        <p className="text-xs mt-0.5" style={{ color: `${INK}45` }}>
          Upload a Google Meet transcript (.docx or .txt) or record a meeting directly to generate a summary and follow-up email.
        </p>
      </div>

      {/* Form card */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>New Meeting</span>
          {(step === 'done' || step === 'error') && (
            <button onClick={handleReset} className="text-xs transition-colors" style={{ color: TEAL }}>← Process another</button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>
              Meeting title <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q2 Project Review" disabled={processing}
              className={inputCls} style={inputStyle} />
          </div>

          {/* Project */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>
              Link to project
              <span className="ml-1.5 normal-case font-normal" style={{ color: `${INK}35` }}>
                — or leave blank and we'll auto-detect from the transcript
              </span>
            </label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              disabled={processing} className={inputCls} style={inputStyle}>
              <option value="">Auto-detect from transcript</option>
              {projects.filter(p => p.status !== 'completed').map(p => (
                <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>
              ))}
            </select>
          </div>

          {/* Input mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: CREAM }}>
            {(['upload', 'record'] as const).map(mode => (
              <button key={mode} onClick={() => !processing && setInputMode(mode)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                style={{
                  background: inputMode === mode ? 'white' : 'transparent',
                  color: inputMode === mode ? INK : `${INK}50`,
                  boxShadow: inputMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {mode === 'upload' ? 'Upload transcript' : '🎙 Record meeting'}
              </button>
            ))}
          </div>

          {/* File upload */}
          {inputMode === 'upload' && (
            <div>
              <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>
                Google Meet transcript <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input ref={fileInputRef} type="file" accept=".docx,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) validateAndSetFile(f) }} />
              <div
                onClick={() => !processing && fileInputRef.current?.click()}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                onDrop={e => { if (!processing) handleDrop(e) }}
                className="rounded-xl flex flex-col items-center justify-center gap-2 py-8 transition-colors"
                style={{
                  border: `2px dashed ${dragging ? TEAL : file ? TEAL : BORDER}`,
                  background: dragging ? 'rgba(74,140,122,0.04)' : file ? 'rgba(74,140,122,0.03)' : CREAM,
                  cursor: processing ? 'default' : 'pointer',
                }}>
                {file ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 4h8l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke={TEAL} strokeWidth="1.5"/>
                      <path d="M12 4v4h4" stroke={TEAL} strokeWidth="1.5"/>
                    </svg>
                    <span className="text-sm font-medium" style={{ color: TEAL_DARK }}>{file.name}</span>
                    <span className="text-xs" style={{ color: `${INK}40` }}>{(file.size / 1024).toFixed(0)} KB · click to change</span>
                  </>
                ) : (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V8m0 0l-3 3m3-3l3 3" stroke={`${INK}40`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M20 16.7A5 5 0 0017 7h-1.26A8 8 0 104 15.25" stroke={`${INK}40`} strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-sm" style={{ color: `${INK}50` }}>
                      Drag & drop or <span style={{ color: TEAL, fontWeight: 500 }}>browse</span>
                    </span>
                    <span className="text-xs" style={{ color: `${INK}30` }}>Accepts .docx and .txt · max 10MB</span>
                  </>
                )}
              </div>
              {fileError && <p className="text-xs mt-1.5" style={{ color: '#dc2626' }}>{fileError}</p>}
            </div>
          )}

          {/* Recorder */}
          {inputMode === 'record' && (
            <div className="space-y-3">
              <div className="rounded-xl flex flex-col items-center justify-center gap-3 py-8"
                style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
                {/* Record / Stop button */}
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={requesting || transcribing || processing}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: recording ? '#dc2626' : TEAL,
                    opacity: requesting || transcribing ? 0.5 : 1,
                    boxShadow: recording ? '0 0 0 6px rgba(220,38,38,0.15)' : '0 0 0 6px rgba(74,140,122,0.12)',
                  }}>
                  {recording ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                      <rect x="4" y="4" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <rect x="8" y="2" width="6" height="12" rx="3" fill="white"/>
                      <path d="M4 11a7 7 0 0014 0" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M11 18v2" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>

                {/* Status */}
                {requesting ? (
                  <div className="text-center">
                    <p className="text-sm font-medium animate-pulse" style={{ color: TEAL }}>Waiting for permissions…</p>
                    <p className="text-xs mt-0.5" style={{ color: `${INK}40` }}>Allow microphone access to begin</p>
                  </div>
                ) : transcribing ? (
                  <div className="text-center">
                    <p className="text-sm font-medium animate-pulse" style={{ color: TEAL }}>Transcribing…</p>
                    <p className="text-xs mt-0.5" style={{ color: `${INK}40` }}>This may take a moment</p>
                  </div>
                ) : recording ? (
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: '#dc2626' }}>
                      Recording · {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: `${INK}40` }}>Recording — click Stop when done</p>
                  </div>
                ) : recordedTranscript ? (
                  <p className="text-sm font-medium" style={{ color: TEAL }}>✓ Transcript ready</p>
                ) : (
                  <div className="text-center">
                    <p className="text-sm" style={{ color: `${INK}50` }}>Click to start recording</p>
                    <p className="text-xs mt-0.5" style={{ color: `${INK}30` }}>Allow mic access to start recording</p>
                  </div>
                )}
              </div>

              {transcribeError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px' }}>
                  <p className="text-xs" style={{ color: '#dc2626' }}>{transcribeError}</p>
                  {recordingBlobUrl && (
                    <a href={recordingBlobUrl} download="meeting-recording.webm"
                      className="text-xs font-medium mt-1.5 inline-block"
                      style={{ color: '#dc2626', textDecoration: 'underline' }}>
                      Download recording audio
                    </a>
                  )}
                </div>
              )}

              {/* Transcript preview / editor */}
              {recordedTranscript && !transcribing && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-widest mb-1.5 block" style={{ color: `${INK}50` }}>
                    Transcript — edit if needed
                  </label>
                  <textarea
                    value={recordedTranscript}
                    onChange={e => setRecordedTranscript(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 rounded-xl text-xs resize-y focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, background: 'white', color: INK, lineHeight: 1.6, fontFamily: 'monospace' }}
                  />
                </div>
              )}
            </div>
          )}

          <button onClick={handleProcess} disabled={!canProcess}
            className="w-full h-10 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: TEAL, color: 'white' }}>
            {processing ? 'Processing…' : 'Generate summary & email'}
          </button>
        </div>
      </div>

      {/* Status stepper */}
      {step !== 'idle' && step !== 'error' && (
        <div className="rounded-xl px-5 mb-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          <Stepper step={step} />
        </div>
      )}

      {/* Error */}
      {step === 'error' && error && (
        <div className="rounded-xl px-5 py-4 mb-4 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {step === 'done' && result && (
        <div className="rounded-xl overflow-hidden mb-6" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          {/* Summary */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Key Decisions & Actions</span>
            {/* Linked project pill */}
            {linkedProject ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: linkedProject.color || TEAL }} />
                <span className="text-xs font-medium" style={{ color: TEAL_DARK }}>{linkedProject.name}</span>
              </div>
            ) : (
              <span className="text-xs" style={{ color: `${INK}30` }}>No project matched</span>
            )}
          </div>
          <ul className="px-5 py-4 space-y-2">
            {result.summary.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: INK }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TEAL }} />
                {point}
              </li>
            ))}
          </ul>

          {/* Email preview */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Follow-up Email</span>
            <button onClick={() => setIsEditing(v => !v)}
              className="text-xs px-3 py-1 rounded-lg transition-colors"
              style={{ border: `1px solid ${BORDER}`, color: isEditing ? TEAL_DARK : `${INK}60`, background: isEditing ? 'rgba(74,140,122,0.06)' : 'white' }}>
              {isEditing ? 'Done editing' : 'Edit email'}
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: `${INK}40` }}>Subject</p>
              {isEditing ? (
                <input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg text-sm focus:outline-none"
                  style={{ border: `1px solid ${TEAL}`, boxShadow: '0 0 0 2px rgba(74,140,122,0.12)', color: INK, background: 'white' }} />
              ) : (
                <p className="text-sm font-medium" style={{ color: INK }}>{editSubject}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: `${INK}40` }}>Body</p>
              {isEditing ? (
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
                  style={{ border: `1px solid ${TEAL}`, boxShadow: '0 0 0 2px rgba(74,140,122,0.12)', color: INK, background: 'white', lineHeight: '1.6' }} />
              ) : (
                <p className="text-sm whitespace-pre-wrap" style={{ color: INK, lineHeight: '1.7' }}>{editBody}</p>
              )}
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-3" style={{ borderTop: `1px solid ${BORDER}`, background: CREAM }}>
            <button onClick={handleCopy}
              className="px-4 h-9 rounded-xl text-sm font-medium transition-all"
              style={{ background: copied ? TEAL_DARK : TEAL, color: 'white' }}>
              {copied ? 'Copied!' : 'Copy email'}
            </button>
          </div>

          {error && step === 'done' && (
            <div className="px-5 pb-4 text-xs" style={{ color: '#dc2626' }}>{error}</div>
          )}
        </div>
      )}

      {/* Action tasks — shown after processing if Claude found any */}
      {step === 'done' && actionTasks.length > 0 && (() => {
        const linkedProject = projects.find(p => p.id === linkedProjectId)
        const stages = linkedProject?.stages ?? []
        return (
          <div className="rounded-xl overflow-hidden mb-6" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Action Items</span>
              <span className="text-xs" style={{ color: `${INK}35` }}>Create as tasks — stage &amp; assignee optional</span>
            </div>
            <div className="divide-y" style={{ borderColor: BORDER }}>
              {actionTasks.map((task, idx) => (
                <div key={idx} className="px-5 py-3 space-y-2">
                  {/* Title row */}
                  <div className="flex items-center gap-3">
                    {task.added ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                        <circle cx="8" cy="8" r="7" fill={TEAL}/>
                        <path d="M5 8l2.5 2.5L11 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: `1.5px solid ${BORDER}` }} />
                    )}
                    <input
                      value={task.title}
                      onChange={e => setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, title: e.target.value } : t))}
                      disabled={task.added}
                      className="flex-1 text-sm bg-transparent focus:outline-none"
                      style={{ color: task.added ? `${INK}50` : INK }}
                    />
                  </div>
                  {/* Dropdowns + button */}
                  {!task.added && (
                    <div className="flex items-center gap-2 pl-7 flex-wrap">
                      {stages.length > 0 && (
                        <select
                          value={task.stageId ?? ''}
                          onChange={e => setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, stageId: e.target.value || null } : t))}
                          className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                          style={{ border: `1px solid ${BORDER}`, background: CREAM, color: task.stageId ? INK : `${INK}50`, maxWidth: 160 }}>
                          <option value="">No stage</option>
                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      <select
                        value={task.assigneeId}
                        onChange={e => setActionTasks(prev => prev.map((t, i) => i === idx ? { ...t, assigneeId: e.target.value } : t))}
                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                        style={{ border: `1px solid ${BORDER}`, background: CREAM, color: INK, maxWidth: 160 }}>
                        <option value="">Unassigned</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.id === session?.user?.memberId ? `${m.name} (you)` : m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => addActionTask(idx)}
                        disabled={task.adding || !task.title.trim()}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                        style={{ background: TEAL, color: 'white', border: 'none', cursor: task.adding || !task.title.trim() ? 'default' : 'pointer' }}>
                        {task.adding ? 'Adding…' : '+ Add task'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Past meetings */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Past Meetings</span>
        </div>

        {listLoading ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: `${INK}40` }}>Loading…</div>
        ) : pastMeetings.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: `${INK}40` }}>No meetings processed yet.</div>
        ) : (
          <div>
            <div className="grid px-5 py-2.5" style={{ gridTemplateColumns: '1fr 170px 110px 120px 80px 36px', borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
              {['Title', 'Project', 'Date', 'Recipient', 'Status', ''].map(h => (
                <span key={h} className="text-xs font-medium uppercase tracking-widest" style={{ color: `${INK}40` }}>{h}</span>
              ))}
            </div>
            {pastMeetings.map((m, i) => (
              <div key={m.id}>
                <div
                  className="grid px-5 py-3 items-center cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => {
                    const next = expandedId === m.id ? null : m.id
                    setExpandedId(next)
                    if (next && m.action_items?.length && !pastActionTasks[m.id]) {
                      const memberId = session?.user?.memberId ?? ''
                      setPastActionTasks(prev => ({
                        ...prev,
                        [m.id]: m.action_items!.map(title => ({ title, stageId: null, assigneeId: memberId, adding: false, added: false })),
                      }))
                    }
                  }}
                  style={{ gridTemplateColumns: '1fr 170px 110px 120px 80px 36px', borderBottom: expandedId === m.id ? 'none' : i < pastMeetings.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                  <div className="min-w-0 pr-4">
                    <p className="text-sm truncate" style={{ color: INK }}>{m.title}</p>
                    {m.email_subject && (
                      <p className="text-xs truncate mt-0.5" style={{ color: `${INK}35` }}>{m.email_subject}</p>
                    )}
                  </div>
                  <div className="pr-3" onClick={e => e.stopPropagation()}>
                    <InlineProjectSelect
                      meetingId={m.id}
                      currentProjectId={m.project_id}
                      projects={projects}
                      onUpdated={(pid, proj) => {
                        setPastMeetings(prev => prev.map(x =>
                          x.id === m.id ? { ...x, project_id: pid, project: proj } : x
                        ))
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono" style={{ color: `${INK}50` }}>
                    {format(parseISO(m.created_at), 'd MMM yyyy')}
                  </span>
                  <span className="text-xs truncate pr-2" style={{ color: `${INK}50` }}>
                    {m.recipient_email || '—'}
                  </span>
                  <StatusBadge status={m.status} />
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(m.id) }}
                    disabled={deletingId === m.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 disabled:opacity-40"
                    style={{ color: `${INK}30` }}
                    title="Delete">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M2 3h9M5 3V2h3v1M4 3l.5 7.5h4L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                {expandedId === m.id && (
                  <div className="px-5 pb-4 pt-2 space-y-3" style={{ borderBottom: i < pastMeetings.length - 1 ? `1px solid ${BORDER}` : undefined, background: 'white' }}>
                    {m.summary && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: `${INK}40` }}>Key Decisions & Actions</p>
                        <ul className="space-y-1.5">
                          {m.summary.split('\n').filter(Boolean).map((point, pi) => (
                            <li key={pi} className="flex items-start gap-2 text-sm" style={{ color: INK }}>
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TEAL }} />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.email_body && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: `${INK}40` }}>Subject</p>
                        <p className="text-sm font-medium mb-3" style={{ color: INK }}>{m.email_subject}</p>
                        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: `${INK}40` }}>Body</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: INK, lineHeight: '1.7' }}>{m.email_body}</p>
                        <button
                          onClick={() => handlePastCopy(m)}
                          className="mt-3 px-4 h-8 rounded-xl text-xs font-medium transition-all"
                          style={{ background: pastCopied === m.id ? TEAL_DARK : TEAL, color: 'white' }}>
                          {pastCopied === m.id ? 'Copied!' : 'Copy email'}
                        </button>
                      </div>
                    )}
                    {m.transcript && (
                      <div>
                        <button
                          onClick={() => setTranscriptExpandedId(t => t === m.id ? null : m.id)}
                          className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest mb-2"
                          style={{ color: `${INK}40`, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                            style={{ transform: transcriptExpandedId === m.id ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Transcript
                        </button>
                        {transcriptExpandedId === m.id && (
                          <div className="rounded-xl p-4 overflow-y-auto max-h-96"
                            style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
                            <SpeakerTranscript text={m.transcript} />
                          </div>
                        )}
                      </div>
                    )}
                    {pastActionTasks[m.id]?.length > 0 && (() => {
                      const linkedProject = projects.find(p => p.id === m.project_id)
                      const stages = linkedProject?.stages ?? []
                      return (
                        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
                            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>Action Items</span>
                            <span className="text-xs" style={{ color: `${INK}35` }}>Create as tasks</span>
                          </div>
                          <div className="divide-y" style={{ borderColor: BORDER }}>
                            {pastActionTasks[m.id].map((task, idx) => (
                              <div key={idx} className="px-4 py-2.5 space-y-2">
                                <div className="flex items-center gap-3">
                                  {task.added ? (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                                      <circle cx="8" cy="8" r="7" fill={TEAL}/>
                                      <path d="M5 8l2.5 2.5L11 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  ) : (
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: `1.5px solid ${BORDER}` }} />
                                  )}
                                  <input
                                    value={task.title}
                                    onChange={e => setPastActionTasks(prev => ({ ...prev, [m.id]: prev[m.id].map((t, i) => i === idx ? { ...t, title: e.target.value } : t) }))}
                                    disabled={task.added}
                                    className="flex-1 text-sm bg-transparent focus:outline-none"
                                    style={{ color: task.added ? `${INK}50` : INK }}
                                  />
                                </div>
                                {!task.added && (
                                  <div className="flex items-center gap-2 pl-7 flex-wrap">
                                    {stages.length > 0 && (
                                      <select
                                        value={task.stageId ?? ''}
                                        onChange={e => setPastActionTasks(prev => ({ ...prev, [m.id]: prev[m.id].map((t, i) => i === idx ? { ...t, stageId: e.target.value || null } : t) }))}
                                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                        style={{ border: `1px solid ${BORDER}`, background: CREAM, color: task.stageId ? INK : `${INK}50`, maxWidth: 160 }}>
                                        <option value="">No stage</option>
                                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    )}
                                    <select
                                      value={task.assigneeId}
                                      onChange={e => setPastActionTasks(prev => ({ ...prev, [m.id]: prev[m.id].map((t, i) => i === idx ? { ...t, assigneeId: e.target.value } : t) }))}
                                      className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                      style={{ border: `1px solid ${BORDER}`, background: CREAM, color: INK, maxWidth: 160 }}>
                                      <option value="">Unassigned</option>
                                      {members.map(mem => (
                                        <option key={mem.id} value={mem.id}>
                                          {mem.id === session?.user?.memberId ? `${mem.name} (you)` : mem.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => addPastActionTask(m.id, m.project_id, idx)}
                                      disabled={task.adding || !task.title.trim()}
                                      className="text-xs font-semibold rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                                      style={{ background: TEAL, color: 'white', border: 'none', cursor: task.adding || !task.title.trim() ? 'default' : 'pointer' }}>
                                      {task.adding ? 'Adding…' : '+ Add task'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
