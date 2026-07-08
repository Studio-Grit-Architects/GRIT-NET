import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deliverables } = await req.json()
  if (!Array.isArray(deliverables) || deliverables.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  // Assign positions per stage (0-indexed within each stage)
  const positionByStage = new Map<string, number>()
  const rows = deliverables.map((d: { stage_id: string; title: string }) => {
    const pos = positionByStage.get(d.stage_id) ?? 0
    positionByStage.set(d.stage_id, pos + 1)
    return { stage_id: d.stage_id, title: d.title, completed: false, position: pos }
  })

  const db = supabaseAdmin()
  const { error } = await db.from('stage_deliverables').insert(rows)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: rows.length })
}
