import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getValidAccessToken } from '@/lib/google-tokens'
import Anthropic from '@anthropic-ai/sdk'

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64Url(plain.body.data)
    return payload.parts.map((p: any) => extractText(p)).filter(Boolean).join('\n')
  }
  return ''
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query?.trim()) return NextResponse.json({ error: 'No search query provided' }, { status: 400 })

  const token = await getValidAccessToken(session.user.memberId)
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 403 })

  // Search Gmail for matching threads
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!searchRes.ok) return NextResponse.json({ error: 'Gmail search failed' }, { status: 502 })

  const searchData = await searchRes.json()
  const threads: { id: string }[] = searchData.threads || []
  if (threads.length === 0) return NextResponse.json({ error: 'No matching threads found' }, { status: 404 })

  // Fetch full content of the most recent matching thread
  const threadRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threads[0].id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!threadRes.ok) return NextResponse.json({ error: 'Failed to fetch thread content' }, { status: 502 })

  const thread = await threadRes.json()
  const messages: any[] = thread.messages || []

  // Build a readable transcript — up to 10 messages, 2000 chars each
  const transcript = messages.slice(0, 10).map((msg: any) => {
    const h = msg.payload?.headers || []
    const get = (n: string) => h.find((x: any) => x.name === n)?.value || ''
    return `From: ${get('From')}\nDate: ${get('Date')}\nSubject: ${get('Subject')}\n\n${extractText(msg.payload).slice(0, 2000)}`
  }).join('\n\n---\n\n')

  const threadSubject = (messages[0]?.payload?.headers || [])
    .find((h: any) => h.name === 'Subject')?.value || '(No subject)'

  // Ask Claude to extract proposal fields
  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })
  let aiMessage
  try {
    aiMessage = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'You are a data extraction assistant for an architecture firm. Respond only with valid JSON — no markdown, no explanation.',
      messages: [{
        role: 'user',
        content: `Extract fee proposal data from this email thread. Return a JSON object with only the fields you can determine confidently (omit the rest entirely):

{
  "clientName": "string",
  "address": "string",
  "constructionCost": number,
  "feePercent": number,
  "selectedStages": [1, 2, 3, 4],
  "stagePercentages": {"1": 5, "2": 15, "3": 30, "4": 45},
  "date": "YYYY-MM-DD"
}

Rules:
- constructionCost: numeric GBP value, no symbol (calculate if given as rate × area, e.g. 32sqm × £4,250 = 136000)
- feePercent: plain number, e.g. 8 for 8%
- selectedStages: array of RIBA stage numbers (1–5) to include; omit any stage explicitly excluded by the client
- stagePercentages: only include if the thread explicitly states how the fee splits across stages; keys are stage number strings, values are percentages of the total fee
- date: ISO date of when the fee proposal was sent (YYYY-MM-DD)

Thread:
${transcript}`,
      }],
    })
  } catch {
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
  }

  if (!aiMessage.content?.[0] || aiMessage.content[0].type !== 'text') {
    return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 })
  }
  const raw = (aiMessage.content[0] as { type: 'text'; text: string }).text.trim()
  const jsonStr = raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw

  let extracted: Record<string, any>
  try {
    extracted = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  return NextResponse.json({ ...extracted, threadSubject })
}
