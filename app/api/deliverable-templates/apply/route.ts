import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { template_id, stage_id } = await req.json()
  const db = supabaseAdmin()
  const { data: items } = await db
    .from('deliverable_template_items').select('*').eq('template_id', template_id).order('position')
  if (!items?.length) return NextResponse.json([])
  const { data: existing } = await db
    .from('stage_deliverables').select('position').eq('stage_id', stage_id)
    .order('position', { ascending: false }).limit(1)
  const startPos = existing && existing.length > 0 ? existing[0].position + 1 : 0
  const { data, error } = await db
    .from('stage_deliverables')
    .insert(items.map((item, i) => ({
      stage_id,
      title: item.title,
      completed: false,
      position: startPos + i,
    })))
    .select()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json(data)
}
