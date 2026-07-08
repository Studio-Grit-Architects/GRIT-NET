import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ subscribed: false })
  const db = supabaseAdmin()
  const { data } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('member_id', session.user.memberId)
    .maybeSingle()
  return NextResponse.json({ subscribed: !!data })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await req.json()
  const db = supabaseAdmin()

  // Remove all old subscriptions for this member before saving the new one
  await db.from('push_subscriptions').delete().eq('member_id', session.user.memberId)
  await db.from('push_subscriptions').insert({
    member_id: session.user.memberId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await req.json()
  const db = supabaseAdmin()

  await db
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('member_id', session.user.memberId)

  return NextResponse.json({ ok: true })
}
