'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'

const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'

interface Proposal {
  id: string
  project_id: string | null
  created_at: string
  updated_at: string
  status: string
  form_data: {
    address?: string
    clientName?: string
    date?: string
    constructionCost?: number
    feePercent?: number
  }
}

export default function ProposalsPage() {
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Record<string, { name: string; code: string }>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/proposals').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
    ]).then(([proposalData, projectData]) => {
      setProposals(Array.isArray(proposalData) ? proposalData : [])
      const map: Record<string, { name: string; code: string }> = {}
      if (Array.isArray(projectData)) {
        for (const p of projectData) map[p.id] = { name: p.name, code: p.code }
      }
      setProjects(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this proposal?')) return
    await fetch('/api/proposals', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setProposals(prev => prev.filter(p => p.id !== id))
  }

  const gbp = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold" style={{ color: INK }}>Fee Proposals</h1>
          <p className="text-xs mt-0.5" style={{ color: `${INK}50` }}>Create and manage architectural fee proposals</p>
        </div>
        <button
          onClick={() => router.push('/proposals/new')}
          className="h-9 px-4 rounded-xl text-sm font-medium"
          style={{ background: TEAL, color: 'white' }}>
          + New Proposal
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm" style={{ color: `${INK}40` }}>Loading…</div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl px-6 py-16 text-center" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          <p className="text-sm mb-1" style={{ color: `${INK}50` }}>No proposals yet</p>
          <p className="text-xs mb-4" style={{ color: `${INK}30` }}>Create your first fee proposal to get started</p>
          <button
            onClick={() => router.push('/proposals/new')}
            className="h-8 px-4 rounded-xl text-xs font-medium"
            style={{ background: TEAL, color: 'white' }}>
            + New Proposal
          </button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
          {/* Desktop header — hidden on mobile */}
          <div className="hidden sm:grid px-5 py-2.5 text-xs font-semibold uppercase tracking-widest"
            style={{ gridTemplateColumns: '1fr 1fr 120px 100px 80px', background: CREAM, borderBottom: `1px solid ${BORDER}`, color: `${INK}45` }}>
            <div>Address</div>
            <div>Project</div>
            <div>Date</div>
            <div>Fee</div>
            <div />
          </div>
          {proposals.map((p, i) => {
            const proj = p.project_id ? projects[p.project_id] : null
            const fd = p.form_data || {}
            const fee = fd.constructionCost && fd.feePercent ? fd.constructionCost * fd.feePercent / 100 : null
            const dateStr = fd.date ? format(parseISO(fd.date), 'd MMM yyyy') : format(parseISO(p.created_at), 'd MMM yyyy')
            return (
              <div
                key={p.id}
                style={{ borderBottom: i < proposals.length - 1 ? `1px solid ${BORDER}` : undefined }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafaf8'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>

                {/* Mobile card layout */}
                <div className="sm:hidden px-4 py-3.5 cursor-pointer" onClick={() => router.push(`/proposals/new?id=${p.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" style={{ color: INK }}>{fd.address || '—'}</div>
                      {fd.clientName && <div className="text-xs mt-0.5 truncate" style={{ color: `${INK}45` }}>{fd.clientName}</div>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {proj && <span className="text-xs" style={{ color: `${INK}50` }}>{proj.name}</span>}
                        <span className="text-xs" style={{ color: `${INK}35` }}>{dateStr}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-sm font-mono" style={{ color: fee ? TEAL_DARK : `${INK}30` }}>{fee ? gbp(fee) : '—'}</span>
                      <button
                        onClick={e => handleDelete(p.id, e)}
                        className="h-6 px-2.5 rounded-lg text-xs"
                        style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop row layout */}
                <div
                  className="hidden sm:grid items-center px-5 py-3.5 cursor-pointer"
                  style={{ gridTemplateColumns: '1fr 1fr 120px 100px 80px' }}
                  onClick={() => router.push(`/proposals/new?id=${p.id}`)}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: INK }}>{fd.address || '—'}</div>
                    {fd.clientName && <div className="text-xs truncate mt-0.5" style={{ color: `${INK}45` }}>{fd.clientName}</div>}
                  </div>
                  <div className="min-w-0">
                    {proj ? (
                      <div className="flex items-center gap-2">
                        {proj.code && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: CREAM, color: `${INK}40` }}>{proj.code}</span>}
                        <span className="text-sm truncate" style={{ color: `${INK}70` }}>{proj.name}</span>
                      </div>
                    ) : <span className="text-sm" style={{ color: `${INK}30` }}>—</span>}
                  </div>
                  <div className="text-xs" style={{ color: `${INK}50` }}>{dateStr}</div>
                  <div className="text-sm font-mono" style={{ color: fee ? TEAL_DARK : `${INK}30` }}>{fee ? gbp(fee) : '—'}</div>
                  <div className="flex justify-end">
                    <button
                      onClick={e => handleDelete(p.id, e)}
                      className="h-6 px-2.5 rounded-lg text-xs transition-all"
                      style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fef2f2' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fee2e2'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fef2f2'}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
