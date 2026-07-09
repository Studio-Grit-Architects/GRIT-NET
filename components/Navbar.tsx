'use client'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VoiceButton } from './VoiceButton'

const TEAL = '#ED2224'
const INK = '#1a1a1a'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'

const navItems = [
  { href: '/',          label: 'Studio',    exact: true },
  { href: '/dashboard', label: 'Time' },
  { href: '/projects',  label: 'Projects' },
  { href: '/meetings',  label: 'Meetings' },
  { href: '/reports',   label: 'Reports',   adminOnly: true },
]

const managementItems = [
  { href: '/clients',     label: 'Clients' },
  { href: '/team',        label: 'Team' },
  { href: '/contractors', label: 'Contractors' },
]

export function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const isAdmin = session?.user?.isAdmin
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const mgmtRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMobileOpen(false); setMgmtOpen(false) }, [pathname])

  // Close management dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (mgmtRef.current && !mgmtRef.current.contains(e.target as Node)) {
        setMgmtOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = session?.user?.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  const isProjectDetail = /^\/projects\/[^/]+$/.test(pathname)
  const visibleItems = navItems.filter(({ adminOnly }) => !adminOnly || isAdmin)

  const mgmtActive = managementItems.some(m => pathname.startsWith(m.href))

  function isActive({ href, exact }: { href: string; exact?: boolean }) {
    return isProjectDetail
      ? href === '/projects'
      : exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <>
      <nav style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }} className="h-12 flex items-center px-4 sm:px-6 gap-1 sticky top-0 z-50">
        <Link href="/" className="mr-4 sm:mr-6 flex items-center flex-shrink-0">
          <img src="/logo.png" alt={process.env.NEXT_PUBLIC_FIRM_NAME ?? 'Studio'} style={{ height: '18px', width: 'auto' }} />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {visibleItems.map(({ href, label, exact }) => {
            const active = isActive({ href, exact })
            return (
              <Link key={href} href={href}
                className="px-3 py-1.5 rounded-md text-sm transition-colors tracking-wide"
                style={{ color: active ? TEAL : `${INK}45`, fontWeight: active ? 500 : 400 }}>
                {label}
              </Link>
            )
          })}

          {/* Management dropdown — admin only */}
          {isAdmin && (
            <div ref={mgmtRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMgmtOpen(v => !v)}
                className="px-3 py-1.5 rounded-md text-sm transition-colors tracking-wide flex items-center gap-1"
                style={{ color: mgmtActive ? TEAL : `${INK}45`, fontWeight: mgmtActive ? 500 : 400, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                Management
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  style={{ transition: 'transform 0.15s', transform: mgmtOpen ? 'rotate(180deg)' : 'rotate(0deg)', marginTop: 1 }}>
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {mgmtOpen && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden"
                  style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 160, zIndex: 100 }}>
                  {managementItems.map(({ href, label }, i) => {
                    const active = pathname.startsWith(href)
                    return (
                      <Link key={href} href={href}
                        className="flex items-center px-4 py-2.5 text-sm tracking-wide"
                        style={{
                          color: active ? TEAL : `${INK}70`,
                          fontWeight: active ? 500 : 400,
                          borderBottom: i < managementItems.length - 1 ? `1px solid ${BORDER}` : undefined,
                          background: active ? 'rgba(74,140,122,0.05)' : 'white',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#fafaf8' }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'white' }}>
                        {label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <VoiceButton />
          <span className="text-sm hidden sm:block tracking-wide" style={{ color: `${INK}35` }}>
            {session?.user?.name?.split(' ')[0]}
          </span>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ background: TEAL, color: 'white' }}
            title="Sign out">
            {initials}
          </button>
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 flex-shrink-0"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Menu">
            <span className="block w-5 h-0.5 rounded-full" style={{ background: mobileOpen ? TEAL : `${INK}50` }} />
            <span className="block w-5 h-0.5 rounded-full" style={{ background: mobileOpen ? TEAL : `${INK}50` }} />
            <span className="block w-5 h-0.5 rounded-full" style={{ background: mobileOpen ? TEAL : `${INK}50` }} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden sticky top-12 z-40 px-4 py-3 flex flex-col gap-1" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
          {visibleItems.map(({ href, label, exact }) => {
            const active = isActive({ href, exact })
            return (
              <Link key={href} href={href}
                className="px-3 py-2.5 rounded-lg text-sm tracking-wide"
                style={{
                  color: active ? TEAL : `${INK}60`,
                  fontWeight: active ? 500 : 400,
                  background: active ? 'rgba(74,140,122,0.08)' : 'transparent',
                }}>
                {label}
              </Link>
            )
          })}

          {/* Management section — admin only, mobile */}
          {isAdmin && (
            <>
              <div className="px-3 pt-2 pb-1" style={{ color: `${INK}35`, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Management
              </div>
              {managementItems.map(({ href, label }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link key={href} href={href}
                    className="pl-6 pr-3 py-2.5 rounded-lg text-sm tracking-wide"
                    style={{
                      color: active ? TEAL : `${INK}60`,
                      fontWeight: active ? 500 : 400,
                      background: active ? 'rgba(74,140,122,0.08)' : 'transparent',
                    }}>
                    {label}
                  </Link>
                )
              })}
            </>
          )}
        </div>
      )}
    </>
  )
}


7fcd1842-39bd-473c-a04b-780af2161c81
