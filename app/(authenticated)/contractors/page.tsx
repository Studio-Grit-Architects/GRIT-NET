'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

const TEAL      = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM     = '#EEECE6'
const BORDER    = '#d8d5ce'
const INK       = '#1a1a1a'

interface Contractor {
  id: string
  service: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  rating: number | null
  notes: string | null
}

const EMPTY: Omit<Contractor, 'id'> = {
  service: '',
  name: '',
  company: '',
  email: '',
  phone: '',
  rating: null,
  notes: '',
}

const SERVICE_ORDER = [
  'Construction',
  'Structural Engineer',
  'Energy Consultant',
  'Planning Advisor',
  'Timber Framing',
  'Landscaper',
]

function StarRating({ value, onChange, readonly }: { value: number | null; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n === value ? 0 : n)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: readonly ? 'default' : 'pointer',
            color: value && n <= value ? '#f59e0b' : `${INK}20`, fontSize: 14, lineHeight: 1,
          }}>
          ★
        </button>
      ))}
    </div>
  )
}

const inputStyle = {
  border: `1px solid ${BORDER}`,
  background: CREAM,
  color: INK,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  borderRadius: 8,
  height: 34,
  padding: '0 10px',
}

export default function ContractorsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Contractor | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<Omit<Contractor, 'id'>>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/contractors')
      .then(r => r.json())
      .then(data => { setContractors(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Group by service, preserving order
  const groups = SERVICE_ORDER.reduce<Record<string, Contractor[]>>((acc, svc) => {
    const items = contractors.filter(c => c.service === svc)
    if (items.length) acc[svc] = items
    return acc
  }, {})
  // Any services not in SERVICE_ORDER go at the end
  contractors.forEach(c => {
    if (!SERVICE_ORDER.includes(c.service) && c.service) {
      if (!groups[c.service]) groups[c.service] = []
      if (!groups[c.service].find(x => x.id === c.id)) groups[c.service].push(c)
    }
  })

  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.service.trim()) return
    setSaving(true)
    try {
      const r = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!r.ok) { alert('Failed to add contractor. Please try again.'); return }
      const c = await r.json()
      setContractors(prev => [...prev, c])
      setAddForm(EMPTY)
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      const r = await fetch('/api/contractors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!r.ok) { alert('Failed to save contractor. Please try again.'); return }
      const updated = await r.json()
      setContractors(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this contractor?')) return
    const r = await fetch('/api/contractors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!r.ok) { alert('Failed to delete contractor. Please try again.'); return }
    setContractors(prev => prev.filter(c => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  if (!session?.user?.isAdmin) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-sm" style={{ color: `${INK}40` }}>You don&apos;t have permission to view this page.</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-medium tracking-wide" style={{ color: INK }}>Contractors</h1>
        {isAdmin && (
          <button
            onClick={() => { setShowAdd(true); setExpanded(null); setEditing(null) }}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: TEAL, color: 'white', border: 'none', cursor: 'pointer' }}>
            + Add Contractor
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl p-5 mb-5" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: `${INK}45` }}>New Contractor</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Service / Trade *</label>
              <input
                list="service-options"
                value={addForm.service}
                onChange={e => setAddForm(p => ({ ...p, service: e.target.value }))}
                placeholder="e.g. Construction"
                style={inputStyle}
              />
              <datalist id="service-options">
                {SERVICE_ORDER.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Contact Name *</label>
              <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Smith" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Company</label>
              <input value={addForm.company || ''} onChange={e => setAddForm(p => ({ ...p, company: e.target.value }))} placeholder="e.g. Smith Construction Ltd" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Email</label>
              <input type="email" value={addForm.email || ''} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Phone</label>
              <input value={addForm.phone || ''} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} placeholder="07700 000000" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Rating</label>
              <div className="flex items-center h-[34px]">
                <StarRating value={addForm.rating} onChange={v => setAddForm(p => ({ ...p, rating: v || null }))} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Notes</label>
              <textarea
                value={addForm.notes || ''}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any notes…"
                rows={2}
                className="resize-y"
                style={{ ...inputStyle, height: 'auto', padding: '8px 10px' }}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setAddForm(EMPTY) }}
              className="px-4 py-1.5 rounded-lg text-sm"
              style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving || !addForm.name.trim() || !addForm.service.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: TEAL, color: 'white', border: 'none', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Add Contractor'}
            </button>
          </div>
        </div>
      )}

      {/* Contractor list grouped by service */}
      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : contractors.length === 0 ? (
        <div className="rounded-xl py-16 text-center text-sm" style={{ background: 'white', border: `1px solid ${BORDER}`, color: `${INK}40` }}>
          No contractors yet. Add your first one above.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([service, items]) => (
            <div key={service} className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
              {/* Service header */}
              <div className="px-5 py-3 flex items-center justify-between" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${INK}50` }}>{service}</span>
                <span className="text-xs font-mono" style={{ color: `${INK}30` }}>{items.length}</span>
              </div>

              {/* Contractors in this service */}
              {items.map((c, i) => (
                <div key={c.id}>
                  {/* Row */}
                  <div
                    className="px-5 py-3.5 flex items-center gap-4 cursor-pointer"
                    style={{ borderBottom: expanded === c.id || i < items.length - 1 ? `1px solid ${BORDER}` : undefined, background: 'white' }}
                    onMouseEnter={e => { if (expanded !== c.id) (e.currentTarget as HTMLElement).style.background = '#fafaf8' }}
                    onMouseLeave={e => { if (expanded !== c.id) (e.currentTarget as HTMLElement).style.background = 'white' }}
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: INK }}>{c.company || c.name}</span>
                        {c.company && <span className="text-xs" style={{ color: `${INK}45` }}>{c.name}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {c.email && <span className="text-xs" style={{ color: `${INK}40` }}>{c.email}</span>}
                        {c.phone && <span className="text-xs" style={{ color: `${INK}40` }}>{c.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {c.rating && <StarRating value={c.rating} readonly />}
                      <span style={{ color: `${INK}25`, fontSize: 12 }}>{expanded === c.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail / edit */}
                  {expanded === c.id && (
                    <div className="px-5 py-4" style={{ background: '#fafaf8', borderBottom: i < items.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                      {editing?.id === c.id ? (
                        /* Edit form */
                        <div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Service / Trade</label>
                              <input
                                list="service-options-edit"
                                value={editing.service}
                                onChange={e => setEditing(p => p ? { ...p, service: e.target.value } : p)}
                                style={inputStyle}
                              />
                              <datalist id="service-options-edit">
                                {SERVICE_ORDER.map(s => <option key={s} value={s} />)}
                              </datalist>
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Contact Name</label>
                              <input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} style={inputStyle} />
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Company</label>
                              <input value={editing.company || ''} onChange={e => setEditing(p => p ? { ...p, company: e.target.value } : p)} style={inputStyle} />
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Email</label>
                              <input type="email" value={editing.email || ''} onChange={e => setEditing(p => p ? { ...p, email: e.target.value } : p)} style={inputStyle} />
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Phone</label>
                              <input value={editing.phone || ''} onChange={e => setEditing(p => p ? { ...p, phone: e.target.value } : p)} style={inputStyle} />
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Rating</label>
                              <div className="flex items-center h-[34px]">
                                <StarRating value={editing.rating} onChange={v => setEditing(p => p ? { ...p, rating: v || null } : p)} />
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs mb-1" style={{ color: `${INK}50` }}>Notes</label>
                              <textarea
                                value={editing.notes || ''}
                                onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)}
                                rows={2}
                                className="resize-y"
                                style={{ ...inputStyle, height: 'auto', padding: '8px 10px' }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-between">
                            <button onClick={() => handleDelete(c.id)}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.04)', cursor: 'pointer' }}>
                              Delete
                            </button>
                            <div className="flex gap-2">
                              <button onClick={() => setEditing(null)}
                                className="px-4 py-1.5 rounded-lg text-sm"
                                style={{ border: `1px solid ${BORDER}`, color: `${INK}60`, background: 'white', cursor: 'pointer' }}>
                                Cancel
                              </button>
                              <button onClick={handleSave} disabled={saving}
                                className="px-4 py-1.5 rounded-lg text-sm font-medium"
                                style={{ background: TEAL, color: 'white', border: 'none', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Read view */
                        <div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-3 text-sm">
                            {c.email && (
                              <div>
                                <span className="text-xs uppercase tracking-widest" style={{ color: `${INK}35` }}>Email</span>
                                <div><a href={`mailto:${c.email}`} style={{ color: TEAL_DARK }}>{c.email}</a></div>
                              </div>
                            )}
                            {c.phone && (
                              <div>
                                <span className="text-xs uppercase tracking-widest" style={{ color: `${INK}35` }}>Phone</span>
                                <div><a href={`tel:${c.phone}`} style={{ color: INK }}>{c.phone}</a></div>
                              </div>
                            )}
                            {c.rating && (
                              <div>
                                <span className="text-xs uppercase tracking-widest" style={{ color: `${INK}35` }}>Rating</span>
                                <div className="mt-1"><StarRating value={c.rating} readonly /></div>
                              </div>
                            )}
                            {c.notes && (
                              <div className="sm:col-span-2">
                                <span className="text-xs uppercase tracking-widest" style={{ color: `${INK}35` }}>Notes</span>
                                <div className="text-sm mt-0.5" style={{ color: `${INK}70` }}>{c.notes}</div>
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <button onClick={() => setEditing({ ...c })}
                              className="text-xs px-3 py-1.5 rounded-lg"
                              style={{ border: `1px solid ${BORDER}`, color: `${INK}50`, background: 'white', cursor: 'pointer' }}>
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
