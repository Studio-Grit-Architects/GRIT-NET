import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const isAdmin = await checkAdmin(session)
  const selectFields = isAdmin ? '*' : 'id, name'
  const { data, error } = await db
    .from('team_members')
    .select(selectFields)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, ...body } = await req.json()
  // Prevent admins from removing their own admin access
  if (id === session?.user?.memberId && body.is_admin === false) {
    return NextResponse.json({ error: 'Cannot remove your own admin access' }, { status: 403 })
  }
  const db = supabaseAdmin()
  // Explicitly allow only safe fields — block google_access_token, google_refresh_token, is_admin via generic PUT
  const allowed: Record<string, any> = {}
  const fields = ['name', 'role', 'phone'] as const
  for (const f of fields) { if (f in body) allowed[f] = body[f] }
  // is_admin allowed only if explicitly provided (admin toggle in Team page)
  if ('is_admin' in body) allowed.is_admin = body.is_admin
  const { data, error } = await db.from('team_members').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('team_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
