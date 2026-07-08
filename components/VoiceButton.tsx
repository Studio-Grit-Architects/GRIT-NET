'use client'
import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { format, subDays } from 'date-fns'

const TEAL   = '#4A8C7A'
const CREAM  = '#EEECE6'
const BORDER = '#d8d5ce'
const INK    = '#1a1a1a'

// How long to wait after last spoken word before auto-stopping (ms)
const SILENCE_TIMEOUT = 2000

type State = 'idle' | 'listening' | 'processing' | 'responding'

export function VoiceButton() {
  const { data: session } = useSession()
  const [state,       setState]       = useState<State>('idle')
  const [transcript,  setTranscript]  = useState('')
  const [interimText, setInterimText] = useState('')
  const [response,    setResponse]    = useState('')
  const [showPanel,   setShowPanel]   = useState(false)
  const [supported,   setSupported]   = useState(false)

  const recognitionRef  = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTextRef    = useRef('')

  // Mobile path: record with MediaRecorder and transcribe via Groq Whisper —
  // the Web Speech API is too unreliable on phones (server-dependent on
  // Android, buggy on iOS Safari, absent in several mobile browsers)
  const isMobileRef      = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef     = useRef<MediaStream | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const levelTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const mimeTypeRef      = useRef('audio/webm')
  const heardSpeechRef   = useRef(false)
  const discardRef       = useRef(false)

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    isMobileRef.current = mobile
    setSupported(mobile
      ? !!(typeof navigator.mediaDevices?.getUserMedia === 'function' && 'MediaRecorder' in window)
      : ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window))
  }, [])

  async function buildContext() {
    const from     = format(subDays(new Date(), 14), 'yyyy-MM-dd')
    const to       = format(new Date(), 'yyyy-MM-dd')
    const memberId = session?.user?.memberId
    const [projectsRes, entriesRes, membersRes] = await Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/entries?member_id=${memberId}&week_start=${from}&week_end=${to}`).then(r => r.json()),
      fetch('/api/members').then(r => r.json()),
    ])
    const projects = Array.isArray(projectsRes) ? projectsRes.filter((p: any) => !p.archived && p.status !== 'completed') : []
    const entries  = Array.isArray(entriesRes)  ? entriesRes  : []
    const members  = Array.isArray(membersRes)  ? membersRes  : []
    return {
      userName: session?.user?.name?.split(' ')[0] ?? 'there',
      activeProjects: projects.map((p: any) => ({
        id: p.id, name: p.name, code: p.code, status: p.status,
        stagesCompleted: (p.stages || []).filter((s: any) => s.completed).length,
        stagesTotal: (p.stages || []).length,
        stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
      })),
      recentEntries: entries.slice(0, 10).map((e: any) => ({
        project: e.project?.name ?? '', stage: e.stage?.name ?? '',
        hours: e.hours, date: e.date,
      })),
      teamMembers: members.map((m: any) => ({ id: m.id, name: m.name })),
    }
  }

  async function sendToChat(text: string) {
    setState('processing')
    setResponse('')
    try {
      const context = await buildContext()
      setState('responding')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], context }),
      })
      if (!res.ok || !res.body) {
        setResponse('Sorry — something went wrong. Please try again.')
        return
      }
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      // strips a trailing backend error marker ("\n[Error: ...]") from the stream
      const stripError = (s: string) => s.replace(/\n?\[Error:[\s\S]*$/, '').trim()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // stream:true so multi-byte chars (e.g. £ in budget replies) aren't split
        full += decoder.decode(value, { stream: true })
        setResponse(stripError(full))
      }
      const clean = stripError(full)
      if (!clean) {
        // backend errored before any usable text, or returned nothing
        setResponse('Sorry — something went wrong. Please try again.')
        return
      }
      setResponse(clean)
      speakResponse(clean)
    } catch {
      setResponse('Something went wrong. Please try again.')
    } finally {
      setState('idle')
    }
  }

  function speakResponse(text: string) {
    if (!('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    // Queue sentence-sized utterances — mobile Chrome silently stops mid-way
    // through a single long utterance
    const chunks = text.match(/[^.!?\n]+[.!?]*/g) ?? [text]
    for (const chunk of chunks) {
      const t = chunk.trim()
      if (!t) continue
      const u = new SpeechSynthesisUtterance(t)
      u.lang = 'en-GB'; u.rate = 1.05
      window.speechSynthesis.speak(u)
    }
  }

  function cleanupMobileAudio() {
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null }
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }

  async function transcribeAndSend(blob: Blob) {
    setState('processing')
    try {
      const res = await fetch('/api/meetings/transcribe/upload', {
        method: 'POST',
        headers: { 'Content-Type': mimeTypeRef.current, 'X-Audio-Mime': mimeTypeRef.current },
        body: blob,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.transcript) throw new Error(data.error || 'Transcription failed')
      setTranscript(data.transcript)
      await sendToChat(data.transcript)
    } catch {
      setResponse("Sorry — couldn't make out the audio. Tap the mic and try again.")
      setState('idle')
    }
  }

  async function startMobileRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = stream

      const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      const mimeType = PREFERRED.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      mimeTypeRef.current = mimeType || 'audio/webm'
      chunksRef.current = []
      heardSpeechRef.current = false
      discardRef.current = false

      const mr = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        cleanupMobileAudio()
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        mediaRecorderRef.current = null
        if (discardRef.current) { discardRef.current = false; return }
        // Nothing audible was said — don't waste a transcription round-trip
        if (!heardSpeechRef.current || blob.size < 1000) { setState('idle'); return }
        transcribeAndSend(blob)
      }
      mr.start(250)
      mediaRecorderRef.current = mr
      setState('listening')

      // Watch the mic level and auto-stop after SILENCE_TIMEOUT of quiet once
      // speech has been heard (8s grace before anything is said, 60s hard cap)
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      ctx.resume().catch(() => {})
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      const startedAt = performance.now()
      let quietSince = performance.now()

      levelTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current !== mr || mr.state !== 'recording') return
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / buf.length)
        const now = performance.now()
        if (rms > 0.04) { heardSpeechRef.current = true; quietSince = now }
        const quietLimit = heardSpeechRef.current ? SILENCE_TIMEOUT : 8000
        if (now - quietSince > quietLimit || now - startedAt > 60_000) mr.stop()
      }, 100)
    } catch (err) {
      cleanupMobileAudio()
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        setShowPanel(false); setState('idle')
        return
      }
      setResponse('Could not access the microphone — check permissions and try again.')
      setState('idle')
    }
  }

  function startListening() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      // Unlock: mobile browsers only allow speak() initiated by a user gesture.
      // Speaking a muted empty utterance inside this tap authorises the real
      // read-out that happens after the chat response arrives.
      const unlock = new SpeechSynthesisUtterance(' ')
      unlock.volume = 0
      window.speechSynthesis.speak(unlock)
    }
    finalTextRef.current = ''
    setTranscript(''); setInterimText(''); setResponse(''); setShowPanel(true)

    if (isMobileRef.current) {
      startMobileRecording()
      return
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'en-GB'
    recognition.continuous     = true   // keep listening through pauses
    recognition.interimResults = true   // show words as they're spoken
    recognitionRef.current = recognition

    recognition.onstart = () => setState('listening')

    recognition.onresult = (e: any) => {
      // Reset silence timer every time new words arrive
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

      // Rebuild from the FULL results list every event rather than appending from
      // e.resultIndex — mobile Chrome re-delivers final results with resultIndex
      // stuck at 0, so appending duplicates everything said so far
      let final = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript + ' '
        } else {
          interim += e.results[i][0].transcript
        }
      }
      finalTextRef.current = final
      setTranscript(final.trim())
      setInterimText(interim)

      // Auto-stop after silence
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop()
      }, SILENCE_TIMEOUT)
    }

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      setInterimText('')
      const text = finalTextRef.current.trim()
      if (text) {
        sendToChat(text)
      } else {
        setState('idle')
      }
    }

    recognition.onerror = (e: any) => {
      // 'no-speech' is normal — just reset quietly
      if (e.error !== 'no-speech') setState('idle')
    }

    recognition.start()
  }

  function stopListening() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (isMobileRef.current) {
      const mr = mediaRecorderRef.current
      if (mr && mr.state !== 'inactive') mr.stop()
      return
    }
    recognitionRef.current?.stop()
  }

  function close() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.stop()
    discardRef.current = true
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    else cleanupMobileAudio()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setShowPanel(false); setState('idle')
    setTranscript(''); setInterimText(''); setResponse('')
    finalTextRef.current = ''
  }

  if (!supported) return null

  const isListening = state === 'listening'
  const isBusy      = state === 'processing' || state === 'responding'
  const displayText = transcript + (interimText ? (transcript ? ' ' : '') + interimText : '')

  return (
    <>
      <button
        onClick={isListening ? stopListening : startListening}
        title={isListening ? 'Tap to send' : 'Voice command'}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
        style={{ color: isListening ? TEAL : 'rgba(26,26,26,0.4)', position: 'relative' }}
      >
        {isListening && (
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${TEAL}`, animation: 'mm-ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
        )}
        <svg width="15" height="15" viewBox="0 0 24 24" fill={isListening ? TEAL : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>

      {showPanel && (
        <div style={{ position: 'fixed', top: 56, right: 16, width: 300, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden' }}>
          <div style={{ background: CREAM, borderBottom: `1px solid ${BORDER}`, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: `${INK}50` }}>
              {isListening ? 'Listening…' : isBusy ? 'Thinking…' : 'Voice'}
            </span>
            <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${INK}40`, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>

          <div style={{ padding: '12px 14px', minHeight: 48 }}>
            {/* Live transcript */}
            {(displayText || isListening) && (
              <div style={{ fontSize: 13, marginBottom: response ? 10 : 0 }}>
                {displayText ? (
                  <>
                    <span style={{ color: INK }}>{transcript}</span>
                    {interimText && <span style={{ color: `${INK}40` }}>{transcript ? ' ' : ''}{interimText}</span>}
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingTop: 2 }}>
                    {[0, 150, 300].map(d => (
                      <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL, display: 'inline-block', animation: `mm-bounce 0.9s ${d}ms infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {isBusy && !response && <div style={{ fontSize: 13, color: `${INK}30` }}>…</div>}
            {response && <div style={{ fontSize: 13, color: INK, lineHeight: 1.55 }}>{response}</div>}
          </div>

          {!isListening && !isBusy && response && (
            <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 14px' }}>
              <button onClick={startListening} style={{ background: 'none', border: 'none', fontSize: 12, color: TEAL, cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                + Ask another
              </button>
            </div>
          )}

          <style>{`
            @keyframes mm-ping   { 75%,100% { transform:scale(1.6); opacity:0; } }
            @keyframes mm-bounce { 0%,100%  { transform:translateY(0); } 50% { transform:translateY(-5px); } }
          `}</style>
        </div>
      )}
    </>
  )
}
