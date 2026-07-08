import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'
import { fetchAllRows } from '@/lib/supabase-helpers'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const weekStart = searchParams.get('week_start')
  const weekEnd = searchParams.get('week_end')

  const isAdmin = await checkAdmin(session)

  // Non-admins can only ever see their own entries; ignore any member_id param
  const memberId = isAdmin ? searchParams.get('member_id') : session.user.memberId

  const db = supabaseAdmin()

  let data: any[]
  try {
    data = await fetchAllRows(() => {
      let q = db
        .from('time_entries')
        .select('*, project:projects(*), stage:stages(*), member:team_members(*)')
        .order('date', { ascending: true })
      if (memberId) q = q.eq('member_id', memberId)
      if (projectId) q = q.eq('project_id', projectId)
      if (weekStart) q = q.gte('date', weekStart)
      if (weekEnd) q = q.lte('date', weekEnd)
      return q
    })
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memberId = session.user.memberId
  const body = await req.json()
  const db = supabaseAdmin()

  // Upsert: if entry exists for member+project+stage+date, update it
  // Use .is('stage_id', null) when stage_id is null to correctly match NULL rows
  // (PostgREST .eq('stage_id', null) does not match NULL)
  let existingQuery = db
    .from('time_entries')
    .select('id')
    .eq('member_id', memberId)
    .eq('project_id', body.project_id)
    .eq('date', body.date)
  if (body.stage_id == null) {
    existingQuery = existingQuery.is('stage_id', null)
  } else {
    existingQuery = existingQuery.eq('stage_id', body.stage_id)
  }
  const { data: existing } = await existingQuery.maybeSingle()

  let result
  if (existing) {
    if (body.hours === 0) {
      result = await db.from('time_entries').delete().eq('id', existing.id)
    } else {
      result = await db
        .from('time_entries')
        .update({ hours: body.hours, notes: body.notes })
        .eq('id', existing.id)
        .select()
        .single()
    }
  } else if (body.hours > 0) {
    const { member_id: _ignored, ...rest } = body
    result = await db.from('time_entries').insert({ ...rest, member_id: memberId }).select().single()
  } else {
    return NextResponse.json({ ok: true })
  }

  if (result?.error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json(result?.data || { ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseAdmin()
  const { error } = await db.from('time_entries').delete().eq('id', id).eq('member_id', session.user.memberId)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
