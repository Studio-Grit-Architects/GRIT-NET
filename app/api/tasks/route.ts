import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

const TASK_SELECT = '*, assignee:team_members(id,name), stage:stages(id,name), project:projects(id,name,color)'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const assigneeId = searchParams.get('assignee_id')
  const db = supabaseAdmin()
  let query = db.from('tasks').select(TASK_SELECT).order('position', { ascending: true })
  if (projectId) query = query.eq('project_id', projectId)
  // FIX 4: validate assigneeId is a UUID before interpolating into PostgREST filter
  if (assigneeId && UUID_RE.test(assigneeId)) {
    query = query.or(`assignee_id.eq.${assigneeId},assignee_ids.cs.{${assigneeId}}`)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = supabaseAdmin()
  const { data: existing } = await db.from('tasks').select('position')
    .eq('project_id', body.project_id).eq('status', body.status || 'not_started')
    .order('position', { ascending: false }).limit(1)
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0
  const allowed = {
    project_id: body.project_id,
    title: body.title,
    notes: body.notes,
    status: body.status,
    assignee_id: body.assignee_id,
    stage_id: body.stage_id,
    position,
  }
  const { data, error } = await db.from('tasks').insert(allowed).select(TASK_SELECT).single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...body } = await req.json()
  const db = supabaseAdmin()
  const allowed: Record<string, any> = {}
  const fields = ['title', 'notes', 'status', 'assignee_id', 'stage_id', 'position'] as const
  for (const f of fields) { if (f in body) allowed[f] = body[f] }
  const { data, error } = await db.from('tasks').update(allowed).eq('id', id).select(TASK_SELECT).single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
