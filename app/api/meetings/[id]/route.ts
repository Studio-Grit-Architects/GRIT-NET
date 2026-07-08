import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  // FIX 5: meetings table has no owner column — gate destructive ops behind admin check
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = supabaseAdmin()
  const { error } = await db.from('meetings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  // FIX 5: meetings table has no owner column — gate reassignment behind admin check
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { project_id } = await req.json()
  const db = supabaseAdmin()

  const { data, error } = await db
    .from('meetings')
    .update({ project_id: project_id ?? null })
    .eq('id', id)
    .select('id, project_id, project:projects(id, name, color)')
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}
