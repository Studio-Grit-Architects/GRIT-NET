import type { Session } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function checkAdmin(session: Session | null): Promise<boolean> {
  if (!session?.user?.email) return false
  if (process.env.DEMO_MODE === 'true') return true
  if (session.user.email === process.env.ADMIN_EMAIL) return true
  const db = supabaseAdmin()
  const { data } = await db
    .from('team_members')
    .select('is_admin')
    .eq('email', session.user.email)
    .maybeSingle()
  return data?.is_admin === true
}
