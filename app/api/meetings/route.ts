import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('meetings')
    .select('id, title, recipient_email, file_name, transcript, email_subject, email_body, summary, action_items, project_id, status, created_at, project:projects(id, name, color)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Meetings API error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
