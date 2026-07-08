import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getValidAccessToken } from '@/lib/google-tokens'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const MMA_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ? `@${process.env.ALLOWED_EMAIL_DOMAIN}` : ''

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function subjectSuffix(subject: string): string {
  const pipe = subject.indexOf('|')
  return (pipe >= 0 ? subject.slice(pipe + 1) : subject).trim()
}

function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function decodeBase64(str: string): string {
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function extractPlainText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data).slice(0, 500)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part)
      if (text) return text
    }
  }
  return ''
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ threads: [], error: 'no_session' })

  const token = await getValidAccessToken(session.user.memberId)
  if (!token) return NextResponse.json({ threads: [], error: 'no_token' })

  const db = supabaseAdmin()
  const { data: projects } = await db
    .from('projects')
    .select('id, name, color')
    .eq('archived', false)
    .neq('status', 'completed')

  const weekStart = getWeekStart()

  const nameTerms = (projects ?? []).slice(0, 15)
    .map(p => `subject:"${p.name.trim()}"`)
    .join(' OR ')

  if (!nameTerms) return NextResponse.json({ threads: [], weekStart: weekStart.toISOString() })

  // Look back 14 days so unanswered threads don't vanish when the week rolls over on Monday
  const query = `newer_than:14d (${nameTerms})`

  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!searchRes.ok) return NextResponse.json({ threads: [], error: 'gmail_search_failed', weekStart: weekStart.toISOString() })

  const { threads: rawThreads = [] } = await searchRes.json()
  if (!rawThreads.length) return NextResponse.json({ threads: [], weekStart: weekStart.toISOString() })

  const projectMap = new Map((projects ?? []).map(p => [p.name.trim().toLowerCase(), p]))

  // Fetch full message content (not just metadata) so we can extract body text
  const metaResults = await Promise.allSettled(
    rawThreads.map((t: { id: string }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.ok ? r.json() : null)
    )
  )

  const digest: Array<{
    projectId: string; projectName: string; projectColor: string
    subject: string; subjectSuffix: string; snippet: string
    lastSender: string; lastDate: string; daysSince: number
    messageCount: number; awaitingReply: boolean; gmailLink: string
  }> = []

  const bodyTexts: string[] = []

  for (const result of metaResults) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const thread = result.value
    const messages: any[] = thread.messages ?? []
    if (!messages.length) continue

    const firstMsg = messages[0]
    const lastMsg = messages[messages.length - 1]
    const getH = (msg: any, name: string) =>
      (msg?.payload?.headers ?? []).find((h: any) => h.name === name)?.value ?? ''

    const subject = getH(firstMsg, 'Subject')
    const lastFrom = getH(lastMsg, 'From')
    const lastDate = getH(lastMsg, 'Date')

    const pipe = subject.indexOf('|')
    const prefix = (pipe > 0 ? subject.slice(0, pipe) : subject).trim().toLowerCase()
    const project = projectMap.get(prefix)
    if (!project) continue

    const awaitingReply = !lastFrom.toLowerCase().includes(MMA_DOMAIN)
    const bodyText = extractPlainText(lastMsg?.payload) || (lastMsg?.snippet ?? '').slice(0, 300)

    digest.push({
      projectId:     project.id,
      projectName:   project.name,
      projectColor:  project.color ?? '#4A8C7A',
      subject,
      subjectSuffix: subjectSuffix(subject),
      snippet:       bodyText,
      lastSender:    lastFrom.replace(/<.*>/, '').trim(),
      lastDate,
      daysSince:     daysSince(lastDate),
      messageCount:  messages.length,
      awaitingReply,
      gmailLink:     `https://mail.google.com/mail/u/0/#inbox/${thread.id}`,
    })
    bodyTexts.push(bodyText)
  }

  // Summarise all threads in a single Claude call
  if (digest.length > 0) {
    try {
      const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: 'You summarise emails for an architecture practice. Respond only with a JSON array of strings — no markdown, no explanation.',
        messages: [{
          role: 'user',
          content: `Summarise each email below in 10–15 words. Focus on what the client is asking or saying. Be direct and professional. Return a JSON array with one string per email, in the same order.

${bodyTexts.map((t, i) => `Email ${i + 1}:\n${t}`).join('\n\n')}`,
        }],
      })
      if (!message.content?.[0] || message.content[0].type !== 'text') throw new Error('Unexpected AI response')
      const raw = (message.content[0] as { type: 'text'; text: string }).text.trim()
      const jsonStr = raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw
      const summaries: string[] = JSON.parse(jsonStr)
      summaries.forEach((s, i) => {
        if (digest[i] && typeof s === 'string') digest[i].snippet = s
      })
    } catch {
      // Fall back to raw body text — digest still works, just less polished
    }
  }

  // Sort: awaiting first, then by daysSince descending
  digest.sort((a, b) => {
    if (a.awaitingReply !== b.awaitingReply) return a.awaitingReply ? -1 : 1
    return b.daysSince - a.daysSince
  })

  return NextResponse.json({
    threads: digest,
    weekStart: weekStart.toISOString(),
    fetchedAt: new Date().toISOString(),
  })
}
