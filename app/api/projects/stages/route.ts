import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('stages').select('position').eq('project_id', body.project_id)
    .order('position', { ascending: false }).limit(1)
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0
  const { data, error } = await db.from('stages').insert({ ...body, position }).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, ...body } = await req.json()
  const db = supabaseAdmin()
  const { data, error } = await db.from('stages').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('stages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
