import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('deliverable_templates')
    .select('*, items:deliverable_template_items(id, title, position)')
    .order('name')
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, riba_stage, items } = await req.json()
  const db = supabaseAdmin()
  const { data: template, error } = await db
    .from('deliverable_templates').insert({ name, riba_stage }).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  if (items?.length) {
    await db.from('deliverable_template_items').insert(
      items.map((title: string, i: number) => ({ template_id: template.id, title, position: i }))
    )
  }
  return NextResponse.json(template)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('deliverable_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
