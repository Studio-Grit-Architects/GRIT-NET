import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getValidAccessToken } from '@/lib/google-tokens'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getValidAccessToken(session.user.memberId)
  if (!token) return NextResponse.json({ events: [], error: 'no_token' })

  const { searchParams } = new URL(req.url)
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  if (!timeMin || !timeMax) return NextResponse.json({ error: 'timeMin and timeMax required' }, { status: 400 })

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ events: [], error: err.error?.message || 'Calendar fetch failed' })
  }

  const data = await res.json()

  const events = (data.items || []).map((e: any) => ({
    id: e.id,
    title: e.summary || '(No title)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start?.dateTime,
    color: e.colorId ? GOOGLE_COLOURS[e.colorId] : undefined,
    location: e.location,
    description: e.description,
  }))

  return NextResponse.json({ events })
}

// Google Calendar colour IDs → hex
const GOOGLE_COLOURS: Record<string, string> = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
}
