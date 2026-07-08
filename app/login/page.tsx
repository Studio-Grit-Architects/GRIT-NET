'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#EEECE6' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <img src="/logo.png" alt="Studio logo" style={{ height: '48px', width: 'auto' }} />
          </div>
          <p className="text-xs text-[#1a1a1a]/40 uppercase tracking-[0.2em]">Time Tracking</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'white', border: '1px solid #d8d5ce' }}>
          <h2 className="text-sm font-medium mb-1 tracking-wide" style={{ color: '#1a1a1a' }}>Sign in</h2>
          <p className="text-sm mb-6" style={{ color: '#1a1a1a99' }}>Sign in with your work Google account</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              Sign in failed. Make sure you are using your work Google account.
            </div>
          )}

          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: '#4A8C7A', color: 'white' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="rgba(255,255,255,0.9)" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="rgba(255,255,255,0.75)" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="rgba(255,255,255,0.75)" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="rgba(255,255,255,0.9)" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#1a1a1a40' }}>
          {process.env.NEXT_PUBLIC_FIRM_NAME || 'Macronet'} · Internal use only
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
