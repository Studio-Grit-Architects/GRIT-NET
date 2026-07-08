import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getValidAccessToken } from '@/lib/google-tokens'
import { supabaseAdmin } from '@/lib/supabase'

const MMA_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ? `@${process.env.ALLOWED_EMAIL_DOMAIN}` : ''

function subjectPrefix(subject: string): string {
  const pipe = subject.indexOf('|')
  return (pipe > 0 ? subject.slice(0, pipe) : subject).trim().toLowerCase()
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
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

  if (!projects?.length) return NextResponse.json({ threads: [] })

  const projectMap = new Map(
    projects.map(p => [p.name.trim().toLowerCase(), p])
  )

  // Build a Gmail query using actual project names so we don't rely on
  // the pipe character (which Gmail treats as an OR operator).
  const since = new Date(Date.now() - 60 * 86_400_000)
  const afterStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`

  // Take up to 15 projects in the OR query to stay within URL limits
  const nameTerms = projects.slice(0, 15)
    .map(p => `subject:"${p.name.trim()}"`)
    .join(' OR ')
  const query = `after:${afterStr} (${nameTerms})`

  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!searchRes.ok) {
    const body = await searchRes.text()
    return NextResponse.json({ threads: [], error: `gmail_search_failed: ${searchRes.status} ${body.slice(0, 100)}` })
  }

  const { threads: rawThreads = [] } = await searchRes.json()
  if (!rawThreads.length) return NextResponse.json({ threads: [] })

  // Fetch metadata for each thread in parallel
  const metaResults = await Promise.allSettled(
    rawThreads.map((t: { id: string }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.ok ? r.json() : null)
    )
  )

  const awaiting: Array<{
    projectId: string; projectName: string; projectColor: string
    subject: string; snippet: string; lastSender: string
    lastDate: string; daysSince: number; gmailLink: string
  }> = []

  const seenProjects = new Set<string>()

  for (const result of metaResults) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const thread = result.value
    const messages: any[] = thread.messages ?? []
    if (!messages.length) continue

    const firstMsg = messages[0]
    const lastMsg  = messages[messages.length - 1]
    const getH     = (msg: any, name: string) =>
      (msg?.payload?.headers ?? []).find((h: any) => h.name === name)?.value ?? ''

    const subject  = getH(firstMsg, 'Subject')
    const lastFrom = getH(lastMsg, 'From')
    const lastDate = getH(lastMsg, 'Date')
    const snippet  = (lastMsg?.snippet ?? '').slice(0, 120)

    const prefix  = subjectPrefix(subject)
    const project = projectMap.get(prefix)
    if (!project) continue

    if (lastFrom.toLowerCase().includes(MMA_DOMAIN)) continue
    if (seenProjects.has(project.id)) continue
    seenProjects.add(project.id)

    awaiting.push({
      projectId:    project.id,
      projectName:  project.name,
      projectColor: project.color ?? '#4A8C7A',
      subject,
      snippet,
      lastSender:   lastFrom.replace(/<.*>/, '').trim(),
      lastDate,
      daysSince:    daysSince(lastDate),
      gmailLink:    `https://mail.google.com/mail/u/0/#inbox/${thread.id}`,
    })
  }

  awaiting.sort((a, b) => b.daysSince - a.daysSince)
  return NextResponse.json({ threads: awaiting })
}
