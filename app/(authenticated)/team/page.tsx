'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import type { TeamMember } from '@/types'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className="w-8 h-4 rounded-full transition-all relative flex-shrink-0"
      style={{ background: on ? TEAL : '#d1d5db' }}>
      <div className="w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all" style={{ left: on ? '18px' : '2px' }}/>
    </button>
  )
}

export default function TeamPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin
  const currentUserEmail = session?.user?.email
  const [members, setMembers] = useState<(TeamMember & { is_admin?: boolean; is_director?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editingPhone, setEditingPhone] = useState<string | null>(null)
  const [editPhone, setEditPhone] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/members').then(r => r.json()).then(data => {
      setMembers(data); setLoading(false)
    })
  }, [isAdmin])

  async function saveRole(id: string) {
    const r = await fetch('/api/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: editRole })
    })
    if (!r.ok) { alert('Failed to save role. Please try again.'); return }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: editRole } : m))
    setEditing(null)
  }

  async function savePhone(id: string) {
    const phone = editPhone.trim()
    const r = await fetch('/api/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phone: phone || null })
    })
    if (!r.ok) { alert('Failed to save phone. Please try again.'); return }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, phone: phone || null } : m))
    setEditingPhone(null)
  }

  async function toggleAdmin(member: TeamMember & { is_admin?: boolean }) {
    // Prevent removing your own admin
    if (member.email === currentUserEmail) return
    const newVal = !member.is_admin
    const r = await fetch('/api/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id, is_admin: newVal })
    })
    if (!r.ok) { alert('Failed to update admin status. Please try again.'); return }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_admin: newVal } : m))
  }

  async function toggleDirector(member: TeamMember & { is_director?: boolean }) {
    const newVal = !member.is_director
    const r = await fetch('/api/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id, is_director: newVal })
    })
    if (!r.ok) { alert('Failed to update director status. Please try again.'); return }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_director: newVal } : m))
  }

  async function removeMember(id: string) {
    if (!confirm('Remove this team member?')) return
    const r = await fetch('/api/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    if (!r.ok) { alert('Failed to remove member. Please try again.'); return }
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p style={{ color: `${INK}40` }}>You don't have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-base font-medium tracking-wide" style={{ color: INK }}>Team</h1>
        <p className="text-xs mt-0.5" style={{ color: `${INK}50` }}>
          Team members are added automatically when they sign in with Google for the first time.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          {/* Header */}
          <div className="grid px-5 py-2 text-xs font-medium uppercase tracking-widest" style={{ gridTemplateColumns: '1fr auto auto auto', borderBottom: `1px solid ${BORDER}`, background: CREAM, color: `${INK}50` }}>
            <div>Member</div>
            <div className="w-16 text-center mr-4">Director</div>
            <div className="w-16 text-center mr-4">Admin</div>
            <div className="w-16"/>
          </div>

          {members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm" style={{ color: `${INK}40` }}>
              No team members yet.
            </div>
          ) : (
            members.map((member, i) => {
              const initials = member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              const isEditingThis = editing === member.id
              const isSelf = member.email === currentUserEmail
              return (
                <div key={member.id} className="grid items-center px-5 py-3"
                  style={{ gridTemplateColumns: '1fr auto auto auto', borderBottom: i < members.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                  {/* Member info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                      style={{ background: 'rgba(74,140,122,0.1)', color: TEAL_DARK }}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: INK }}>{member.name}</span>
                        {isSelf && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: CREAM, color: `${INK}40` }}>you</span>}
                      </div>
                      <div className="text-xs" style={{ color: `${INK}40` }}>{member.email}</div>
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <input value={editRole} onChange={e => setEditRole(e.target.value)}
                            className="h-7 px-2 border rounded-lg text-xs w-32 focus:outline-none"
                            style={{ border: `1px solid ${BORDER}`, background: CREAM }}
                            placeholder="Role…"
                            onKeyDown={e => e.key === 'Enter' && saveRole(member.id)} autoFocus />
                          <button onClick={() => saveRole(member.id)}
                            className="h-7 px-3 rounded-lg text-xs font-medium"
                            style={{ background: TEAL, color: 'white' }}>Save</button>
                          <button onClick={() => setEditing(null)}
                            className="h-7 px-2 rounded-lg text-xs"
                            style={{ border: `1px solid ${BORDER}`, color: `${INK}50` }}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-0.5">
                          {member.role && <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: CREAM, color: `${INK}50` }}>{member.role}</span>}
                          <button onClick={() => { setEditing(member.id); setEditRole(member.role || '') }}
                            className="text-xs transition-colors"
                            style={{ color: `${INK}30` }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = TEAL}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `${INK}30`}>
                            {member.role ? 'edit role' : '+ add role'}
                          </button>
                        </div>
                      )}

                      {/* Phone number for WhatsApp reminders */}
                      {editingPhone === member.id ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                            className="h-7 px-2 rounded-lg text-xs w-36 focus:outline-none"
                            style={{ border: `1px solid ${BORDER}`, background: CREAM }}
                            placeholder="+447700900000"
                            onKeyDown={e => e.key === 'Enter' && savePhone(member.id)} autoFocus />
                          <button onClick={() => savePhone(member.id)}
                            className="h-7 px-3 rounded-lg text-xs font-medium"
                            style={{ background: TEAL, color: 'white' }}>Save</button>
                          <button onClick={() => setEditingPhone(null)}
                            className="h-7 px-2 rounded-lg text-xs"
                            style={{ border: `1px solid ${BORDER}`, color: `${INK}50` }}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: member.phone ? TEAL : `${INK}25`, flexShrink: 0 }}>
                            <path d="M9 7.5c0 .17-.04.34-.12.5a1.7 1.7 0 01-.33.46c-.2.2-.43.3-.68.3-.18 0-.37-.04-.57-.13a5.6 5.6 0 01-.56-.3 9.8 9.8 0 01-.54-.42 9.4 9.4 0 01-.52-.52 9.8 9.8 0 01-.42-.54 5.6 5.6 0 01-.3-.56 1.6 1.6 0 01-.12-.56c0-.18.03-.35.1-.51a1.6 1.6 0 01.44-.65c.2-.18.42-.27.65-.27.09 0 .18.02.26.06.09.04.17.1.23.19l.8 1.12c.06.09.1.17.14.24.03.07.05.14.05.2 0 .08-.02.16-.07.24a1 1 0 01-.18.22l-.24.25a.17.17 0 00-.05.12c0 .02 0 .05.02.08l.03.07c.06.1.16.24.3.4.14.16.29.33.45.49.16.16.32.3.49.44.16.13.29.22.4.28l.07.03c.03.01.06.02.09.02a.18.18 0 00.12-.05l.25-.25c.07-.07.14-.12.22-.16a.47.47 0 01.23-.06c.06 0 .13.01.2.04.07.03.15.08.24.14l1.14.81c.09.06.15.14.19.23.03.09.05.18.05.28z" stroke="currentColor" strokeWidth=".5" fill="currentColor"/>
                          </svg>
                          <button
                            onClick={() => { setEditingPhone(member.id); setEditPhone(member.phone || '') }}
                            className="text-xs transition-colors"
                            style={{ color: member.phone ? `${INK}40` : `${INK}25` }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = TEAL}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = member.phone ? `${INK}40` : `${INK}25`}>
                            {member.phone ? member.phone : '+ add WhatsApp number'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Director toggle */}
                  <div className="w-16 flex justify-center mr-4">
                    <Toggle on={!!member.is_director} onChange={() => toggleDirector(member)} />
                  </div>

                  {/* Admin toggle */}
                  <div className="w-16 flex justify-center mr-4">
                    {isSelf ? (
                      <span className="text-xs" style={{ color: `${INK}30` }}>—</span>
                    ) : (
                      <Toggle on={!!member.is_admin} onChange={() => toggleAdmin(member)} />
                    )}
                  </div>

                  {/* Remove */}
                  <div className="w-16 flex justify-center">
                    {!isSelf && (
                      <button onClick={() => removeMember(member.id)}
                        className="h-7 px-2.5 rounded-lg text-xs transition-all"
                        style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fee2e2' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(74,140,122,0.06)', border: `1px solid rgba(74,140,122,0.15)` }}>
        <p className="text-xs font-medium mb-1" style={{ color: TEAL_DARK }}>Inviting someone new?</p>
        <p className="text-xs" style={{ color: `${INK}50` }}>Send them <strong>https://mma-timetracker.netlify.app</strong> and ask them to sign in with their Google account. They'll appear here automatically.</p>
      </div>
    </div>
  )
}
