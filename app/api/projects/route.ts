import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('projects')
    .select('*, stages(*), client:clients(id,name)')
    .eq('archived', false)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  const sorted = (data || []).map((p: any) => ({
    ...p,
    stages: (p.stages || []).sort((a: any, b: any) => a.position - b.position),
  }))
  return NextResponse.json(sorted)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const db = supabaseAdmin()
  const allowed = {
    name: body.name,
    client_id: body.client_id,
    client: body.client,
    code: body.code,
    color: body.color,
    status: body.status,
    project_type: body.project_type,
    start_date: body.start_date,
    end_date: body.end_date,
    notes: body.notes,
  }
  const { data, error } = await db.from('projects').insert(allowed).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, ...body } = await req.json()
  const db = supabaseAdmin()
  const allowed: Record<string, any> = {}
  const fields = ['name', 'client_id', 'client', 'code', 'color', 'status', 'project_type', 'start_date', 'end_date', 'notes'] as const
  for (const f of fields) { if (f in body) allowed[f] = body[f] }
  const { data, error } = await db.from('projects').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('projects').update({ archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
