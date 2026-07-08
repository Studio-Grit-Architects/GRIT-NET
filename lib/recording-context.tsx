'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

// 'requesting' = waiting for the two browser permission prompts (mic then tab)
export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'ready' | 'error'

interface RecordingContextValue {
  status: RecordingStatus
  recordingTime: number
  transcript: string | null
  blobUrl: string | null
  error: string | null
  retryIn: number | null  // seconds until auto-retry, null = no countdown
  startRecording: () => Promise<void>
  stopRecording: () => void
  retryTranscription: () => void
  consumeTranscript: () => string | null
  dismiss: () => void
}

const RecordingContext = createContext<RecordingContextValue | null>(null)

export function useRecording() {
  const ctx = useContext(RecordingContext)
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider')
  return ctx
}

// ─── Floating bar ─────────────────────────────────────────────────────────────

const TEAL      = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const INK       = '#1a1a1a'

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function RecordingBar({
  status, time, error, blobUrl, retryIn, transcribingPart, onStop, onRetry, onDismiss,
}: {
  status: RecordingStatus
  time: number
  error: string | null
  blobUrl: string | null
  retryIn: number | null
  transcribingPart: string | null
  onStop: () => void
  onRetry: () => void
  onDismiss: () => void
}) {
  if (status === 'requesting') return (
    <div style={{ background: INK, color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="w-3.5 h-3.5 rounded-full animate-spin flex-shrink-0" style={{ border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
      <span className="text-sm">Waiting for microphone permission…</span>
    </div>
  )

  if (status === 'recording') return (
    <div style={{ background: INK, color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0" style={{ background: '#dc2626' }} />
      <span className="font-mono font-semibold text-sm tabular-nums">REC {fmt(time)}</span>
      <span className="text-xs flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Recording — navigate freely</span>
      <button onClick={onStop} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0"
        style={{ background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer' }}>
        Stop &amp; Transcribe
      </button>
    </div>
  )

  if (status === 'transcribing') return (
    <div style={{ background: TEAL, color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="w-3.5 h-3.5 rounded-full animate-spin flex-shrink-0" style={{ border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
      <span className="text-sm font-medium">
        {transcribingPart ? `Transcribing ${transcribingPart}…` : 'Transcribing — please wait…'}
      </span>
    </div>
  )

  if (status === 'ready') return (
    <div style={{ background: TEAL_DARK, color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M3 8l4 4 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-sm font-medium flex-1">Transcript ready</span>
      <Link href="/meetings"
        className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none' }}>
        Go to Meetings →
      </Link>
      <button onClick={onDismiss} className="text-lg flex-shrink-0 leading-none px-1" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>×</button>
    </div>
  )

  if (status === 'error') return (
    <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span className="text-sm flex-1 min-w-0" style={{ color: '#dc2626' }}>
        {error || 'Transcription failed'}
        {retryIn !== null && (
          <span style={{ color: '#dc262680' }}> — auto-retrying in {fmt(retryIn)}</span>
        )}
      </span>
      <button onClick={onRetry}
        className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0"
        style={{ background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer' }}>
        Retry now
      </button>
      {blobUrl && (
        <a href={blobUrl} download="meeting-recording.webm"
          className="text-xs flex-shrink-0"
          style={{ color: '#dc2626', textDecoration: 'underline', opacity: 0.7 }}>
          Download audio
        </a>
      )}
      <button onClick={onDismiss} className="text-lg flex-shrink-0 leading-none px-1" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>×</button>
    </div>
  )

  return null
}

// ─── Provider ─────────────────────────────────────────────────────────────────

// Rotate MediaRecorder every 4 minutes. Stopping and restarting on the same
// AudioContext destination gives a valid standalone WebM file per segment,
// keeping each upload well under Vercel Edge's request body limit.
const SEGMENT_MS = 4 * 60 * 1000

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [status,           setStatus]           = useState<RecordingStatus>('idle')
  const [recordingTime,    setRecordingTime]    = useState(0)
  const [transcript,       setTranscript]       = useState<string | null>(null)
  const [blobUrl,          setBlobUrl]          = useState<string | null>(null)
  const [error,            setError]            = useState<string | null>(null)
  const [retryIn,          setRetryIn]          = useState<number | null>(null)
  const [transcribingPart, setTranscribingPart] = useState<string | null>(null)

  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const micStreamRef       = useRef<MediaStream | null>(null)
  const displayStreamRef   = useRef<MediaStream | null>(null)
  const audioContextRef    = useRef<AudioContext | null>(null)
  const destinationRef     = useRef<MediaStreamAudioDestinationNode | null>(null)
  const chunksRef          = useRef<Blob[]>([])
  const segmentsRef        = useRef<Blob[]>([])   // completed segment blobs (each a valid WebM)
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeTypeRef        = useRef<string>('audio/webm')
  const blobUrlRef         = useRef<string | null>(null)
  const autoRetryCountRef  = useRef<number>(0)
  const recordingActiveRef = useRef<boolean>(false)
  const rotatingRef        = useRef<boolean>(false)  // true while a segment rotation is in progress

  const runTranscriptionRef = useRef<(segments: Blob[]) => void>(() => {})

  // ── Countdown → auto-retry ──────────────────────────────────────────────────
  useEffect(() => {
    if (retryIn === null) return
    if (retryIn <= 0) {
      setRetryIn(null)
      if (segmentsRef.current.length) runTranscriptionRef.current(segmentsRef.current)
      return
    }
    const t = setTimeout(() => setRetryIn(r => r !== null ? r - 1 : null), 1000)
    return () => clearTimeout(t)
  }, [retryIn])

  // ── Warn before a real page unload would discard an unsaved recording ────────
  // The recording + transcript live only in memory, so a hard refresh / tab
  // close / browser-back-out-of-app would silently lose them. (In-app <Link>
  // navigation is safe — the provider lives in the layout and persists.)
  useEffect(() => {
    const atRisk = status === 'requesting' || status === 'recording' || status === 'transcribing' || status === 'ready'
    if (!atRisk) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (segmentIntervalRef.current) clearInterval(segmentIntervalRef.current)
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      displayStreamRef.current?.getTracks().forEach(t => t.stop())
      audioContextRef.current?.close().catch(() => {})
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  // ── Transcription via Groq Whisper ─────────────────────────────────────────
  // Transcribes each segment independently then concatenates the results.
  // For recordings under 4 minutes there is always exactly one segment.
  const runTranscription = useCallback(async (segments: Blob[]) => {
    setStatus('transcribing')
    setError(null)
    setRetryIn(null)
    setTranscribingPart(null)

    let lastError = 'Transcription failed — tap Retry or download the audio.'
    let isTimeout = false

    // Hoisted so retries resume from the first unfinished segment instead of
    // re-transcribing from segment 1 (which re-burns Groq's 20 req/min budget)
    const transcripts: string[] = []
    let rateLimitWaits = 0

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        for (let i = transcripts.length; i < segments.length; i++) {
          if (segments.length > 1) setTranscribingPart(`part ${i + 1} of ${segments.length}`)

          const seg = segments[i]
          const mimeType = seg.type || mimeTypeRef.current || 'audio/webm'

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 120_000)
          const res = await fetch('/api/meetings/transcribe/upload', {
            method: 'POST',
            headers: { 'Content-Type': mimeType, 'X-Audio-Mime': mimeType },
            body: seg,
            signal: controller.signal,
          })
          clearTimeout(timeout)

          if (!res.ok) {
            let errMsg = 'Transcription failed — tap Retry'
            let retryAfter = 15
            try {
              const data = await res.json()
              errMsg = data.error || errMsg
              if (typeof data.retryAfter === 'number') retryAfter = data.retryAfter
            } catch {
              const s = res.status
              if (s === 413) errMsg = 'Recording segment too large — please report this bug'
              else errMsg = `Transcription failed (${s}) — tap Retry`
            }
            lastError = errMsg

            if (res.status === 429 && rateLimitWaits < 10) {
              rateLimitWaits++
              const wait = Math.min(Math.max(retryAfter + 2, 5), 65)
              setTranscribingPart(
                `part ${i + 1} of ${segments.length} — rate limited, waiting ${wait}s`
              )
              await new Promise(r => setTimeout(r, wait * 1000))
              i-- // redo this segment on the next pass
              continue
            }

            // 4xx = client error, retrying won't help
            if (res.status >= 400 && res.status < 500) {
              setTranscribingPart(null)
              setError(lastError)
              setStatus('error')
              return
            }
            throw new Error(errMsg)
          }

          const data = await res.json()
          if (!data.transcript) {
            lastError = data.error || 'Transcription returned empty — the audio may be silent or corrupted'
            throw new Error(lastError)
          }
          transcripts.push(data.transcript)
        }

        // All segments done — join with a blank line between each
        setTranscribingPart(null)
        setTranscript(transcripts.join('\n\n'))
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        setBlobUrl(null)
        blobUrlRef.current = null
        segmentsRef.current = []
        autoRetryCountRef.current = 0
        setStatus('ready')
        return

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = 'Timed out — download the audio and try again.'
          isTimeout = true
          break
        }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        lastError = err instanceof Error ? err.message : 'Network error — tap Retry or download the audio.'
      }
    }

    setTranscribingPart(null)
    setError(lastError)
    setStatus('error')

    // Auto-retry: max 2 attempts, 30s then 60s — never for timeouts
    if (!isTimeout && autoRetryCountRef.current < 2) {
      const delay = autoRetryCountRef.current === 0 ? 30 : 60
      autoRetryCountRef.current += 1
      setRetryIn(delay)
    }
  }, [])

  // Keep runTranscriptionRef in sync so the countdown can call it without
  // being captured in a stale closure
  useEffect(() => {
    runTranscriptionRef.current = runTranscription
  }, [runTranscription])

  // ── Start recording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setStatus('requesting')
    setError(null)
    setRetryIn(null)

    let micStream: MediaStream | null = null
    let displayStream: MediaStream | null = null
    let audioCtx: AudioContext | null = null

    // getDisplayMedia (tab audio capture) is desktop-only — not supported on mobile browsers
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const supportsDisplayMedia = !isMobile && typeof navigator.mediaDevices?.getDisplayMedia === 'function'

    try {
      // 1. Microphone — must be first (inside the user-gesture call stack)
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      // 2. Create and resume AudioContext immediately after mic permission (still inside
      //    the user-gesture stack), before getDisplayMedia which can suspend it on iOS.
      audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }
      if (audioCtx.state !== 'running') {
        throw new Error('AudioContext could not start — please tap the record button again.')
      }

      // 3. Tab audio via screen share (desktop only)
      if (supportsDisplayMedia) {
        // getDisplayMedia always requires video — request a 1×1 px stream so Chrome
        // doesn't waste bandwidth on it. User must pick the Google Meet tab and leave
        // "Share tab audio" checked (it is on by default for Chrome tabs).
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: { width: 1, height: 1, frameRate: 1 },
          })

          // Validate that tab audio was actually included
          if (displayStream.getAudioTracks().length === 0) {
            // No tab audio, but mic is fine — just record mic only
            displayStream.getTracks().forEach(t => t.stop())
            displayStream = null
          }
        } catch (displayErr) {
          // User cancelled the screen-share prompt — fall back to mic-only
          if (displayErr instanceof Error && (displayErr.name === 'NotAllowedError' || displayErr.name === 'AbortError')) {
            displayStream = null
          } else {
            throw displayErr
          }
        }
      }

      // 4. Mix streams via AudioContext (mic-only on mobile, mic + tab on desktop)
      const destination = audioCtx.createMediaStreamDestination()
      audioCtx.createMediaStreamSource(micStream).connect(destination)
      if (displayStream) audioCtx.createMediaStreamSource(displayStream).connect(destination)

      // 5. Record the mixed stream
      const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      const mimeType = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      mimeTypeRef.current = mimeType || 'audio/webm'

      const mr = new MediaRecorder(destination.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      })
      chunksRef.current          = []
      segmentsRef.current        = []
      recordingActiveRef.current = true
      rotatingRef.current        = false

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(1000)

      mediaRecorderRef.current = mr
      micStreamRef.current     = micStream
      displayStreamRef.current = displayStream
      audioContextRef.current  = audioCtx
      destinationRef.current   = destination

      setStatus('recording')
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)

      // Auto-rotate every 4 minutes. Stopping and restarting MediaRecorder on the
      // same AudioContext destination creates a valid standalone WebM file per segment
      // while the underlying audio streams continue uninterrupted.
      segmentIntervalRef.current = setInterval(() => {
        if (rotatingRef.current || !recordingActiveRef.current) return
        const currentMr = mediaRecorderRef.current
        const dest = destinationRef.current
        if (!currentMr || !dest || currentMr.state !== 'recording') return

        rotatingRef.current = true
        currentMr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
          chunksRef.current = []
          if (blob.size > 0) segmentsRef.current.push(blob)

          if (recordingActiveRef.current) {
            const newMr = new MediaRecorder(dest.stream, {
              ...(mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : {}),
              audioBitsPerSecond: 32000,
            })
            newMr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
            newMr.start(1000)
            mediaRecorderRef.current = newMr
          }
          rotatingRef.current = false
        }
        currentMr.stop()
      }, SEGMENT_MS)

    } catch (err) {
      micStream?.getTracks().forEach(t => t.stop())
      displayStream?.getTracks().forEach(t => t.stop())
      audioCtx?.close().catch(() => {})

      // Swallow deliberate cancellations (user clicked Cancel on either prompt)
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        setStatus('idle')
        return
      }

      setError(err instanceof Error ? err.message : 'Could not start recording.')
      setStatus('error')
    }
  }, [])

  // ── Stop recording ──────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    recordingActiveRef.current = false
    if (segmentIntervalRef.current) { clearInterval(segmentIntervalRef.current); segmentIntervalRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    // If a segment rotation is mid-flight, wait for it to finish so we don't
    // clobber its onstop handler or miss the segment it was finalising
    if (rotatingRef.current) {
      await new Promise<void>(resolve => {
        const poll = setInterval(() => {
          if (!rotatingRef.current) { clearInterval(poll); resolve() }
        }, 20)
      })
    }

    const mr = mediaRecorderRef.current
    mediaRecorderRef.current = null

    const stopPromise = mr
      ? new Promise<Blob>(resolve => {
          if (mr.state === 'inactive') {
            // Rotation already stopped this recorder — collect any straggler chunks
            resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }))
          } else {
            mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }))
            mr.stop()
          }
        })
      : Promise.resolve(new Blob([], { type: mimeTypeRef.current }))

    micStreamRef.current?.getTracks().forEach(t => t.stop())
    displayStreamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close().catch(() => {})
    micStreamRef.current     = null
    displayStreamRef.current = null
    audioContextRef.current  = null
    destinationRef.current   = null

    stopPromise.then(lastBlob => {
      chunksRef.current = []
      if (lastBlob.size > 0) segmentsRef.current.push(lastBlob)
      const allSegments = [...segmentsRef.current]

      // Guard: if nothing was recorded, reset cleanly to idle
      if (allSegments.length === 0 || allSegments.every(b => b.size === 0)) {
        segmentsRef.current = []
        setError('No audio was recorded. Please try again.')
        setStatus('idle')
        return
      }

      // Combine all segments into one blob for the download fallback
      const combined = new Blob(allSegments, { type: mimeTypeRef.current })
      const url = URL.createObjectURL(combined)
      setBlobUrl(url)
      blobUrlRef.current = url

      runTranscriptionRef.current(allSegments)
    })
  }, [])

  // ── Manual retry ───────────────────────────────────────────────────────────
  const retryTranscription = useCallback(() => {
    if (!segmentsRef.current.length) return
    autoRetryCountRef.current = 0
    setRetryIn(null)
    runTranscription(segmentsRef.current)
  }, [runTranscription])

  // ── Consume / dismiss ──────────────────────────────────────────────────────
  const consumeTranscript = useCallback(() => {
    const t = transcript
    if (t) { setTranscript(null); setStatus('idle') }
    return t
  }, [transcript])

  const dismiss = useCallback(() => {
    autoRetryCountRef.current = 0
    segmentsRef.current = []
    setRetryIn(null)
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    setBlobUrl(null); setError(null); setTranscript(null); setTranscribingPart(null); setStatus('idle')
  }, [])

  return (
    <RecordingContext.Provider value={{
      status, recordingTime, transcript, blobUrl, error, retryIn,
      startRecording, stopRecording, retryTranscription, consumeTranscript, dismiss,
    }}>
      {status !== 'idle' && (
        <RecordingBar
          status={status}
          time={recordingTime}
          error={error}
          blobUrl={blobUrl}
          retryIn={retryIn}
          transcribingPart={transcribingPart}
          onStop={stopRecording}
          onRetry={retryTranscription}
          onDismiss={dismiss}
        />
      )}
      {children}
    </RecordingContext.Provider>
  )
}
