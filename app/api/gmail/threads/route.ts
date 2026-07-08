import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getValidAccessToken } from '@/lib/google-tokens'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getValidAccessToken(session.user.memberId)
  if (!token) return NextResponse.json({ threads: [], error: 'no_token' })

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')  // client email to search for
  const query = email ? `from:${email} OR to:${email}` : searchParams.get('q') || ''

  if (!query) return NextResponse.json({ threads: [] })

  // Search threads
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!searchRes.ok) return NextResponse.json({ threads: [], error: 'Gmail fetch failed' })

  const searchData = await searchRes.json()
  const threadIds: string[] = (searchData.threads || []).map((t: any) => t.id)

  if (threadIds.length === 0) return NextResponse.json({ threads: [] })

  // Fetch snippet + subject for each thread
  const threads = await Promise.all(
    threadIds.map(async (id) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return null
      const t = await res.json()
      const firstMsg = t.messages?.[0]
      const headers = firstMsg?.payload?.headers || []
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
      return {
        id,
        subject: get('Subject') || '(No subject)',
        from: get('From'),
        date: get('Date'),
        snippet: firstMsg?.snippet || '',
        messageCount: t.messages?.length || 1,
      }
    })
  )

  return NextResponse.json({ threads: threads.filter(Boolean) })
}
