import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 90 * 24 * 60 * 60, // 90 days
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/gmail.readonly',
          ].join(' '),
          access_type: 'offline',  // ensures refresh_token is returned
          prompt: 'consent',       // force consent so refresh_token always comes back
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false
      const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN
      if (allowedDomain && !user.email.endsWith(`@${allowedDomain}`)) return false
      const db = supabaseAdmin()
      const { data } = await db
        .from('team_members')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      const tokenFields = account?.access_token ? {
        google_access_token:  account.access_token,
        google_refresh_token: account.refresh_token ?? undefined,
        google_token_expiry:  account.expires_at ?? undefined,
      } : {}

      if (!data) {
        await db.from('team_members').insert({
          name: user.name || user.email.split('@')[0],
          email: user.email,
          role: '',
          is_admin: user.email === process.env.ADMIN_EMAIL,
          ...tokenFields,
        })
      } else if (account?.access_token) {
        await db.from('team_members').update(tokenFields).eq('email', user.email)
      }
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const db = supabaseAdmin()
        const { data } = await db
          .from('team_members')
          .select('id, name, role, is_admin, is_director')
          .eq('email', session.user.email)
          .maybeSingle()
        if (data) {
          session.user.memberId = data.id
          session.user.role = data.role
          session.user.isAdmin =
            process.env.DEMO_MODE === 'true' ||
            data.is_admin === true ||
            session.user.email === process.env.ADMIN_EMAIL
          session.user.isDirector = data.is_director === true
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
