'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import type { Client } from '@/types'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

export default function ClientsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', address: '' })

  const inputCls = "w-full h-9 px-3 rounded-lg text-sm focus:outline-none"
  const inputStyle = { border: `1px solid ${BORDER}`, background: CREAM }

  async function load() {
    setLoading(true)
    const r = await fetch('/api/clients')
    setClients(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createClient() {
    if (!form.name.trim()) return
    const r = await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!r.ok) { alert('Failed to create client. Please try again.'); return }
    const c = await r.json()
    setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
    setForm({ name: '', contact_name: '', email: '', phone: '', address: '' })
    setShowNew(false)
    setExpanded(c.id)
  }

  async function saveEdit(id: string) {
    const r = await fetch('/api/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }) })
    if (!r.ok) { alert('Failed to save client. Please try again.'); return }
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...editForm } : c))
    setEditing(null)
  }

  async function deleteClient(id: string) {
    if (!confirm('Delete this client?')) return
    const r = await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!r.ok) { alert('Failed to delete client. Please try again.'); return }
    setClients(prev => prev.filter(c => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const Field = ({ label, value }: { label: string; value: string }) => value ? (
    <div>
      <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: `${INK}40` }}>{label}</div>
      <div className="text-sm" style={{ color: INK }}>{value}</div>
    </div>
  ) : null

  if (!isAdmin) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p style={{ color: `${INK}40` }}>You don't have permission to view this page.</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-medium tracking-wide" style={{ color: INK }}>Clients</h1>
          <p className="text-xs mt-0.5" style={{ color: `${INK}50` }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>
          + New client
        </button>
      </div>

      {/* New client form */}
      {showNew && (
        <div className="rounded-xl p-5 mb-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: `${INK}60` }}>New client</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Client name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Alexandra Ehrmann" className={inputCls} style={inputStyle} autoFocus />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Contact name</label>
              <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder="Contact person" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Email</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+44..." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Address</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Address" className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createClient} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>Save client</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-xl text-sm" style={{ border: `1px solid ${BORDER}`, color: `${INK}70` }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: `${INK}40` }}>No clients yet.</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          {clients.map((c, i) => {
            const isExpanded = expanded === c.id
            const isEditing = editing === c.id
            const initials = c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
            const hasDetails = c.contact_name || c.email || c.phone || c.address

            return (
              <div key={c.id} style={{ borderBottom: i < clients.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                {/* Client row */}
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors"
                  style={{ background: isExpanded ? CREAM : 'white' }}
                  onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = '#fafaf8' }}
                  onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'white' }}
                  onClick={() => setExpanded(isExpanded ? null : c.id)}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ background: 'rgba(74,140,122,0.1)', color: TEAL_DARK }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: INK }}>{c.name}</div>
                    {!isExpanded && hasDetails && (
                      <div className="text-xs mt-0.5 flex gap-3" style={{ color: `${INK}40` }}>
                        {c.contact_name && <span>{c.contact_name}</span>}
                        {c.email && <span>{c.email}</span>}
                        {c.phone && <span>{c.phone}</span>}
                      </div>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: `${INK}30` }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1" style={{ background: CREAM, borderTop: `1px solid ${BORDER}` }}>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="col-span-2">
                          <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Client name</label>
                          <input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className={inputCls} style={{ ...inputStyle, background: 'white' }} />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Contact name</label>
                          <input value={editForm.contact_name || ''} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))}
                            className={inputCls} style={{ ...inputStyle, background: 'white' }} />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Email</label>
                          <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            className={inputCls} style={{ ...inputStyle, background: 'white' }} />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Phone</label>
                          <input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                            className={inputCls} style={{ ...inputStyle, background: 'white' }} />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: `${INK}50` }}>Address</label>
                          <input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                            className={inputCls} style={{ ...inputStyle, background: 'white' }} />
                        </div>
                        <div className="col-span-2 flex gap-2 mt-1">
                          <button onClick={() => saveEdit(c.id)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: TEAL, color: 'white' }}>Save</button>
                          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm" style={{ border: `1px solid ${BORDER}`, color: `${INK}70`, background: 'white' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <Field label="Contact" value={c.contact_name} />
                          <Field label="Email" value={c.email} />
                          <Field label="Phone" value={c.phone} />
                          <Field label="Address" value={c.address} />
                        </div>
                        {!hasDetails && (
                          <p className="text-xs mb-3" style={{ color: `${INK}35` }}>No details added yet.</p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(c.id); setEditForm(c) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white' }}>
                            Edit details
                          </button>
                          <button onClick={() => deleteClient(c.id)}
                            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                            style={{ border: `1px solid #fca5a5`, color: '#dc2626', background: '#fef2f2' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
