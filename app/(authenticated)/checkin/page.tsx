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

const TIME_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]

interface Stage   { id: string; name: string; position: number }
interface Project {
  id: string; name: string; code: string; color: string
  status: string; archived: boolean
  client?: { id: string; name: string } | null
  stages?: Stage[]
}
interface Entry {
  project: Project; hours: number
  stageId: string | null; stageName: string | null; note: string
}

function fmtHours(h: number): string {
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return hrs + ':' + String(mins).padStart(2, '0')
}

function timeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

type Screen = 'welcome' | 'selector' | 'question' | 'summary' | 'done'

export default function CheckinPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [screen,       setScreen]       = useState<Screen>('welcome')
  const [projects,     setProjects]     = useState<Project[]>([])
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [queue,        setQueue]        = useState<Project[]>([])
  const [currentIdx,   setCurrentIdx]   = useState(0)
  const [selTime,      setSelTime]      = useState<number | null>(null)
  const [selStageId,   setSelStageId]   = useState<string | null>(null)
  const [selStageName, setSelStageName] = useState<string | null>(null)
  const [showCustom,   setShowCustom]   = useState(false)
  const [customVal,    setCustomVal]    = useState('')
  const [note,         setNote]         = useState('')
  const [results,      setResults]      = useState<Entry[]>([])
  const [submitting,   setSubmitting]   = useState(false)

  const _now       = new Date()
  const today      = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const todayLabel = _now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: Project[]) => setProjects(data.filter(p => !p.archived && p.status !== 'completed')))
  }, [])

  function toggleProject(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function startCheckin() {
    setQueue(projects.filter(p => selected.has(p.id)))
    setCurrentIdx(0); setResults([]); resetQ()
    setScreen('question')
  }

  function resetQ() {
    setSelTime(null); setSelStageId(null); setSelStageName(null)
    setShowCustom(false); setCustomVal(''); setNote('')
  }

  function handleCustomConfirm() {
    const v = parseFloat(customVal)
    if (!isNaN(v) && v > 0) { setSelTime(v); setShowCustom(false) }
  }

  function nextProject() {
    const newResults = [...results, { project: queue[currentIdx], hours: selTime!, stageId: selStageId, stageName: selStageName, note }]
    setResults(newResults)
    if (currentIdx + 1 < queue.length) { setCurrentIdx(i => i + 1); resetQ() }
    else setScreen('summary')
  }

  async function submit() {
    if (!session?.user?.memberId) return
    setSubmitting(true)
    try {
      const responses = await Promise.all(results.map(r =>
        fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            member_id: session.user.memberId,
            project_id: r.project.id,
            stage_id: r.stageId,
            hours: r.hours,
            notes: r.note || null,
            date: today,
          }),
        })
      ))
      const failed = responses.filter(r => !r.ok)
      if (failed.length > 0) {
        alert(`${failed.length} of ${responses.length} entries failed to save. Please try again.`)
        return
      }
      setScreen('done')
    } finally {
      setSubmitting(false)
    }
  }

  const cur    = queue[currentIdx]
  const stages = cur?.stages || []
  const color  = cur?.color || TEAL
  const total  = results.reduce((s, r) => s + r.hours, 0)
  const pct    = queue.length ? Math.round((currentIdx / queue.length) * 100) : 0

  const page: React.CSSProperties = { background: PAGE_BG, minHeight: '100vh', padding: '16px' }
  const shell: React.CSSProperties = { width: '100%', maxWidth: 480, margin: '0 auto' }

  // Shared card style
  const card: React.CSSProperties = { background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden' }

  function Header() {
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
        <Header />
        <div style={card}>
          <SectionHeader label="Daily Check-in" />
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: INK, marginBottom: 8 }}>Good {timeOfDay()}.</div>
            <div style={{ fontSize: 14, color: `${INK}60`, marginBottom: 32 }}>How did today go? Log your hours in a minute.</div>
            <button
              onClick={() => setScreen('selector')}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '13px 40px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}
            >
              Let&apos;s go
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── SELECTOR ───────────────────────────────────────────────────────────────
  if (screen === 'selector') return (
    <div style={page}>
      <div style={shell}>
        <Header />
        <div style={{ ...card, marginBottom: 12 }}>
          <SectionHeader label="Select Projects" />
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {projects.map(p => {
              const on = selected.has(p.id)
              return (
                <div
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  style={{ background: on ? `${p.color}12` : CREAM, border: `1.5px solid ${on ? p.color : BORDER}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', position: 'relative', transition: 'all 0.15s', userSelect: 'none' as const }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color, borderRadius: '12px 12px 0 0', opacity: on ? 1 : 0.3 }} />
                  {p.client?.name && <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: `${INK}50`, marginBottom: 4, marginTop: 4 }}>{p.client.name}</div>}
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{p.name}</div>
                  {on && <div style={{ position: 'absolute', top: 10, right: 10, width: 16, height: 16, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <span style={{ fontSize: 13, color: `${INK}50` }}><strong style={{ color: INK }}>{selected.size}</strong> selected</span>
          <button
            onClick={startCheckin}
            disabled={selected.size === 0}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'default', opacity: selected.size > 0 ? 1 : 0.35, transition: 'opacity 0.15s' }}
          >
            Log time →
          </button>
        </div>
      </div>
    </div>
  )

  // ── QUESTION ───────────────────────────────────────────────────────────────
  if (screen === 'question' && cur) return (
    <div style={page}>
      <div style={shell}>
        <Header />

        {/* Progress */}
        <div style={{ marginBottom: 12, padding: '0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: `${INK}50`, marginBottom: 6 }}>
            <span>Project {currentIdx + 1} of {queue.length}</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 3, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: TEAL, borderRadius: 2, width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
            {queue.map((_, i) => (
              <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i < currentIdx ? TEAL : i === currentIdx ? `${TEAL}60` : BORDER, transition: 'background 0.3s' }} />
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ height: 3, background: color }} />
          <SectionHeader label="How long today?" />
          <div style={{ padding: '16px 16px 0' }}>
            {cur.client?.name && <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: `${INK}40`, marginBottom: 4 }}>{cur.client.name}</div>}
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginBottom: 16 }}>{cur.name}</div>

            {/* Time grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
              {TIME_OPTIONS.map(val => (
                <button
                  key={val}
                  onClick={() => { setSelTime(val); setShowCustom(false); setCustomVal('') }}
                  style={{ background: selTime === val ? color : CREAM, border: `1.5px solid ${selTime === val ? color : BORDER}`, borderRadius: 10, padding: '10px 4px', fontSize: 13, fontWeight: selTime === val ? 600 : 400, color: selTime === val ? 'white' : INK, cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  {fmtHours(val)}
                </button>
              ))}
              <button
                onClick={() => { setShowCustom(v => !v); setSelTime(null) }}
                style={{ gridColumn: 'span 2', background: CREAM, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px', fontSize: 12, fontWeight: 500, color: `${INK}70`, cursor: 'pointer' }}
              >
                ✏ Custom
              </button>
            </div>

            {showCustom && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  autoFocus type="number" min="0.25" max="16" step="0.25"
                  value={customVal} onChange={e => setCustomVal(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="h-10"
                  style={{ flex: 1, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '0 12px', fontSize: 14, color: INK, outline: 'none' }}
                />
                <button onClick={handleCustomConfirm} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Set</button>
              </div>
            )}
          </div>

          {/* Stage selector */}
          {stages.length > 0 && (
            <div style={{ borderTop: `1px solid ${BORDER}`, margin: '12px 0 0', padding: '12px 16px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: `${INK}50`, marginBottom: 8 }}>What stage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {stages.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelStageId(s.id); setSelStageName(s.name) }}
                    style={{ background: selStageId === s.id ? TEAL : CREAM, border: `1.5px solid ${selStageId === s.id ? TEAL : BORDER}`, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 500, color: selStageId === s.id ? 'white' : INK, cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          {selTime !== null && (
            <div style={{ padding: '12px 16px 0' }}>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                placeholder="Optional note…"
                style={{ width: '100%', background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: INK, outline: 'none', resize: 'none', height: 64, display: 'block', fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${BORDER}`, marginTop: 12 }}>
            <button onClick={() => { setScreen('selector'); setResults([]); setCurrentIdx(0) }} style={{ background: 'none', border: 'none', fontSize: 13, color: `${INK}50`, cursor: 'pointer', padding: '8px 0' }}>← Back</button>
            <button
              onClick={nextProject}
              disabled={selTime === null}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: selTime !== null ? 'pointer' : 'default', opacity: selTime !== null ? 1 : 0.35, transition: 'all 0.15s' }}
            >
              {currentIdx === queue.length - 1 ? 'Review →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  if (screen === 'summary') return (
    <div style={page}>
      <div style={shell}>
        <Header />
        <div style={card}>
          <SectionHeader label="Review & Submit" />
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${TEAL}12`, border: `1px solid ${TEAL}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: TEAL }}>Total hours</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: TEAL, fontVariantNumeric: 'tabular-nums' }}>{fmtHours(total)}</span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}` }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${BORDER}`, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 3, height: 32, borderRadius: 2, background: r.project.color, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project.name}</div>
                      {(r.stageName || r.note) && <div style={{ fontSize: 11, color: `${INK}50`, marginTop: 2 }}>{[r.stageName, r.note].filter(Boolean).join(' · ')}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEAL_DARK, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtHours(r.hours)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setScreen('selector'); setResults([]); setCurrentIdx(0) }} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', fontSize: 13, color: `${INK}70`, cursor: 'pointer', fontWeight: 500 }}>← Edit</button>
              <button
                onClick={submit}
                disabled={submitting}
                style={{ flex: 1, background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Saving…' : 'Submit timesheet ✓'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── DONE ───────────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      <div style={shell}>
        <Header />
        <div style={card}>
          <div style={{ height: 3, background: TEAL }} />
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: `${TEAL}15`, border: `1.5px solid ${TEAL}30`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: INK, marginBottom: 8 }}>All logged.</div>
            <div style={{ fontSize: 14, color: `${INK}60`, marginBottom: 20 }}>Your timesheet for today has been saved.</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEAL, background: `${TEAL}12`, border: `1px solid ${TEAL}30`, display: 'inline-block', padding: '5px 14px', borderRadius: 20, marginBottom: 28 }}>
              {results.length} project{results.length !== 1 ? 's' : ''} · {fmtHours(total)} total
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ display: 'block', width: '100%', background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 500, color: `${INK}70`, cursor: 'pointer' }}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
