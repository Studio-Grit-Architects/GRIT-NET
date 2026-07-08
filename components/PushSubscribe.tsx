'use client'
import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function subscribe() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
}

export function PushSubscribe() {
  const [status, setStatus] = useState<'loading' | 'idle' | 'subscribed' | 'denied' | 'unsupported'>('loading')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported'); return
    }
    if (Notification.permission === 'denied') { setStatus('denied'); return }

    // Check DB — only show green if there's an active subscription on the server
    fetch('/api/push/subscribe')
      .then(r => r.json())
      .then(({ subscribed }) => setStatus(subscribed ? 'subscribed' : 'idle'))
      .catch(() => setStatus('idle'))
  }, [])

  async function enable() {
    if (status === 'denied') return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setStatus('denied'); return }
    await subscribe()
    setStatus('subscribed')
  }

  if (status === 'loading' || status === 'unsupported') return null

  const isSubscribed = status === 'subscribed'
  const isDenied     = status === 'denied'

  return (
    <button
      onClick={enable}
      title={isDenied ? 'Notifications blocked — enable in browser settings' : isSubscribed ? 'Notifications on — click to re-subscribe' : 'Enable notifications'}
      className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
      style={{ color: isDenied ? 'rgba(26,26,26,0.2)' : isSubscribed ? '#4A8C7A' : 'rgba(26,26,26,0.4)', cursor: isDenied ? 'default' : 'pointer' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={isSubscribed ? '#4A8C7A' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  )
}
