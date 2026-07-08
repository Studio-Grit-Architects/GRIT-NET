import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/auth'
import { fetchAllRows } from '@/lib/supabase-helpers'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await checkAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })


  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const db = supabaseAdmin()

  let data: any[]
  try {
    data = await fetchAllRows(() => {
      let q = db
        .from('time_entries')
        .select('*, project:projects(id,name,client,color), stage:stages(id,name), member:team_members(id,name,email)')
        .order('date', { ascending: false })
      if (from) q = q.gte('date', from)
      if (to) q = q.lte('date', to)
      return q
    })
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json(data)
}
