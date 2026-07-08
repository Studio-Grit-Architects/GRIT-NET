import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  let query = db.from('proposals').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('proposals')
    .insert({
      project_id: body.project_id || null,
      form_data: body.form_data || {},
      status: body.status || 'draft',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, form_data, status, project_id } = await req.json()
  const db = supabaseAdmin()
  // Build update object conditionally — only include keys present in the body
  // to avoid overwriting project_id with null when it wasn't provided
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (form_data !== undefined) update.form_data = form_data
  if (status !== undefined) update.status = status
  if (project_id !== undefined) update.project_id = project_id || null
  const { data, error } = await db
    .from('proposals')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('proposals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
