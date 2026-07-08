import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const db = supabaseAdmin()
  let query = db.from('planning_applications').select('*').order('created_at', { ascending: true })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = supabaseAdmin()
  const allowed = {
    project_id: body.project_id,
    reference: body.reference,
    description: body.description,
    status: body.status,
    submitted_date: body.submitted_date,
    decided_date: body.decided_date,
    url: body.url,
    notes: body.notes,
  }
  const { data, error } = await db.from('planning_applications').insert(allowed).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...body } = await req.json()
  const db = supabaseAdmin()
  const allowed: Record<string, any> = {}
  const fields = ['project_id', 'reference', 'description', 'status', 'submitted_date', 'decided_date', 'url', 'notes'] as const
  for (const f of fields) { if (f in body) allowed[f] = body[f] }
  const { data, error } = await db.from('planning_applications').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('planning_applications').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
