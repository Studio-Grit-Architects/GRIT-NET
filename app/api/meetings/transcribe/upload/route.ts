import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Edge runtime: no request body size limit (serverless caps at 4.5MB)
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 500 })

  const mimeType = req.headers.get('x-audio-mime') || 'audio/webm'

  let audioBuffer: ArrayBuffer
  try {
    audioBuffer = await req.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Failed to read audio data' }, { status: 400 })
  }

  if (audioBuffer.byteLength === 0) {
    return NextResponse.json({ error: 'Empty recording — nothing was captured' }, { status: 400 })
  }

  if (audioBuffer.byteLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Recording too large (max 25MB — try keeping meetings under ~60 minutes)' }, { status: 413 })
  }

  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&keyterm=RIBA&keyterm=party+wall&keyterm=planning+permission',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    }
  )

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const message = errData?.err_msg || errData?.message || 'Transcription failed'
    if (res.status === 429) {
      const headerWait = parseInt(res.headers.get('retry-after') || '', 10)
      return NextResponse.json(
        { error: message, retryAfter: Number.isFinite(headerWait) ? headerWait : 15 },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: message }, { status: res.status >= 400 && res.status < 500 ? res.status : 500 })
  }

  const data = await res.json()
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
  if (!transcript) {
    return NextResponse.json(
      { error: 'Deepgram returned an empty transcript — the audio may be silent or corrupted' },
      { status: 500 }
    )
  }

  return NextResponse.json({ transcript })
}
