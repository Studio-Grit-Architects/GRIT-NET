'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'

const TEAL   = '#4A8C7A'
const BORDER = '#d8d5ce'
const INK    = '#1a1a1a'

export default function LogPage() {
  const { data: session } = useSession()
  const [message, setMessage]   = useState('')
  const [status, setStatus]     = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult]     = useState<{ logged: number; unmatched: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  async function submit() {
    if (!message.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res  = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setResult(data)
      setStatus('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setStatus('error')
    }
  }

  if (status === 'done' && result) {
    return (
      <div style={{ minHeight: '100svh', background: '#F7F6F2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: INK, marginBottom: '0.5rem' }}>
            {result.logged} {result.logged === 1 ? 'entry' : 'entries'} logged
          </h1>
          {result.unmatched > 0 && (
            <p style={{ fontSize: '0.875rem', color: `${INK}80`, marginBottom: '1rem' }}>
              {result.unmatched} {result.unmatched === 1 ? 'item' : 'items'} couldn't be matched to a project — add them manually in the tracker.
            </p>
          )}
          <p style={{ fontSize: '0.875rem', color: `${INK}50`, marginBottom: '2rem' }}>Have a great weekend!</p>
          <a
            href="/dashboard"
            style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: TEAL, color: 'white', borderRadius: 12, fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none' }}
          >
            View timesheet
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: '#F7F6F2', display: 'flex', flexDirection: 'column', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <img src="/logo.png" alt={process.env.NEXT_PUBLIC_FIRM_NAME ?? 'Studio'} style={{ height: 20, width: 'auto', marginBottom: '2.5rem' }} />

        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: INK, marginBottom: '0.5rem' }}>
          Hi {firstName}
        </h1>
        <p style={{ fontSize: '1rem', color: `${INK}70`, marginBottom: '2rem' }}>
          What did you work on this week? Describe it naturally below.
        </p>

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={'3hrs Smith House\n2hrs Admin\n1.5hrs Jones Renovation'}
          rows={6}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            background: 'white',
            color: INK,
            fontSize: '1rem',
            fontFamily: 'var(--font-body)',
            resize: 'none',
            outline: 'none',
            marginBottom: '0.75rem',
          }}
        />

        <p style={{ fontSize: '0.8rem', color: `${INK}50`, marginBottom: '1.5rem' }}>
          Logging for {format(new Date(), 'EEEE d MMMM yyyy')}
        </p>

        <button
          onClick={submit}
          disabled={!message.trim() || status === 'loading'}
          style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: 12,
            background: !message.trim() || status === 'loading' ? `${TEAL}70` : TEAL,
            color: 'white',
            fontWeight: 600,
            fontSize: '1rem',
            border: 'none',
            cursor: !message.trim() || status === 'loading' ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {status === 'loading' ? 'Logging...' : 'Log hours'}
        </button>

        {status === 'error' && (
          <p style={{ marginTop: '1rem', color: '#dc2626', fontSize: '0.875rem', textAlign: 'center' }}>
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  )
}
