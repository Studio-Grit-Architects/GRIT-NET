import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const project_id = searchParams.get('project_id')
  const stage_id = searchParams.get('stage_id')
  const db = supabaseAdmin()

  if (stage_id) {
    const { data, error } = await db
      .from('stage_deliverables').select('*').eq('stage_id', stage_id).order('position')
    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json(data)
  }

  if (project_id) {
    const { data: stages } = await db.from('stages').select('id').eq('project_id', project_id)
    const stageIds = stages?.map(s => s.id) || []
    if (!stageIds.length) return NextResponse.json([])
    const { data, error } = await db
      .from('stage_deliverables').select('*').in('stage_id', stageIds).order('position')
    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json([])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('stage_deliverables').select('position').eq('stage_id', body.stage_id)
    .order('position', { ascending: false }).limit(1)
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0
  const allowed = {
    stage_id: body.stage_id,
    title: body.title,
    completed: body.completed,
    position,
  }
  const { data, error } = await db
    .from('stage_deliverables').insert(allowed).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...body } = await req.json()
  const db = supabaseAdmin()
  const allowed: Record<string, any> = {}
  const fields = ['title', 'completed', 'position'] as const
  for (const f of fields) { if (f in body) allowed[f] = body[f] }
  const { data, error } = await db
    .from('stage_deliverables').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('stage_deliverables').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
