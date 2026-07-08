import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      memberId?: string
      isAdmin?: boolean
      isDirector?: boolean
      role?: string
    } & DefaultSession['user']
  }
}
