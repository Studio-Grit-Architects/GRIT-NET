import { supabaseAdmin } from './supabase'

export async function getValidAccessToken(memberId: string): Promise<string | null> {
  const db = supabaseAdmin()
  const { data } = await db
    .from('team_members')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', memberId)
    .maybeSingle()

  if (!data?.google_access_token) return null

  const now = Math.floor(Date.now() / 1000)

  // Token still valid (60s buffer)
  if (data.google_token_expiry && data.google_token_expiry > now + 60) {
    return data.google_access_token
  }

  // Needs refresh
  if (!data.google_refresh_token) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()
  if (!tokens.access_token) return null

  await db.from('team_members').update({
    google_access_token: tokens.access_token,
    google_token_expiry: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
  }).eq('id', memberId)

  return tokens.access_token
}
