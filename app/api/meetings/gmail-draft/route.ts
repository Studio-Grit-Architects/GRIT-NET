import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'
import { google } from 'googleapis'

function buildRawEmail(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { meetingId, to, subject, body } = await req.json()

  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
  }

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })

  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: buildRawEmail(to, subject, body) } },
    })

    if (meetingId) {
      const db = supabaseAdmin()
      await db.from('meetings').update({ status: 'draft_created' }).eq('id', meetingId)
    }

    return NextResponse.json({ ok: true, draftId: draft.data.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gmail API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
