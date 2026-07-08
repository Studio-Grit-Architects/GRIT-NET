'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'

// ── Design tokens ──────────────────────────────────────────────────────────────
const TEAL = '#4A8C7A'
const TEAL_DARK = '#3a7062'
const CREAM = '#EEECE6'
const BORDER = '#d8d5ce'
const INK = '#1a1a1a'
const PROP_TEAL = '#2a7c6f'  // exact brand colour from InDesign source

// A3 landscape — matches the InDesign source exactly (1190.55 × 841.89pt)
const PAGE_W = 1191
const PAGE_H = 842
// Raleway is the closest free Google Fonts substitute for Brandon Grotesque
const SANS = "'Raleway', sans-serif"
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap'

// ── Constants ──────────────────────────────────────────────────────────────────
const OPTIONAL_PRICES = [250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]

const STAGE_PCT = [0, 3, 12, 20, 40, 25, 0]
const TOTAL_STAGE_PCT = STAGE_PCT.slice(1).reduce((a, b) => a + b, 0)
const CDM_PCT = 11.22

const STAGE_NAMES = [
  'Initial Meeting',
  'Preparation and Briefing',
  'Concept Design',
  'Developed Design',
  'Technical Design',
  'Construction',
]

const STAGE_SHORT = [
  'Initial Meeting',
  'Brief',
  'Concept Design',
  'Developed Design',
  'Technical Design',
  'Construction',
]

// ── Helpers ────────────────────────────────────────────────────────────────────
const gbp = (amount: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount)

function formatDateCover(iso: string): string {
  try {
    return format(parseISO(iso), "do 'of' MMMM yyyy")
  } catch {
    return iso
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProposalForm {
  projectId: string
  clientName: string
  address: string
  date: string
  coverPhoto: string
  introQuote: string
  constructionCost: number
  feePercent: number
  includeCDM: boolean
  cdmFeeAmount: number
  includeInterior: boolean
  interiorFee: number
  includeLandscape: boolean
  landscapeFee: number
  selectedStages: boolean[]
  stagePercentages: number[]
  startMonth: string
  totalWeeks: number
  meetingsPerStage: number[]
  stageFeeOverrides: (number | null)[]
  stageOptionals: {
    artisticRender: number
    physicalModel: number
    cdm: number
    tender: number
    partyWall: number
    specification: number
  }
}

function localDateStr(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function localMonthStr(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

const DEFAULT_FORM: ProposalForm = {
  projectId: '',
  clientName: '',
  address: '',
  date: localDateStr(),
  coverPhoto: '',
  introQuote: `”We're grateful for the chance to work with you on a home that will evolve with your family. The pages that follow trace the route from your current space to somewhere brighter, more generous, and genuinely tuned to the way you live day to day.”`,
  constructionCost: 0,
  feePercent: 0,
  includeCDM: false,
  cdmFeeAmount: 0,
  includeInterior: false,
  interiorFee: 0,
  includeLandscape: false,
  landscapeFee: 0,
  selectedStages: [false, false, false, false, false, false],
  stagePercentages: [...STAGE_PCT],
  startMonth: localMonthStr(),
  totalWeeks: 26,
  meetingsPerStage: [0, 0, 0, 0, 0, 0],
  stageFeeOverrides: [null, null, null, null, null, null],
  stageOptionals: { artisticRender: 0, physicalModel: 0, cdm: 0, tender: 0, partyWall: 0, specification: 0 },
}

// ── Fee calculations ───────────────────────────────────────────────────────────
function calcFees(form: ProposalForm) {
  const stagePcts = form.stagePercentages ?? STAGE_PCT
  const fullPct = stagePcts.slice(1).reduce((a, b) => a + b, 0) || TOTAL_STAGE_PCT
  const totalFee = form.constructionCost * form.feePercent / 100
  const cdmFeeCalc = totalFee * CDM_PCT / 100
  const cdmFee = form.cdmFeeAmount > 0 ? form.cdmFeeAmount : cdmFeeCalc
  const stageFees = stagePcts.map((p, i) => {
    if (i === 0) return 0
    if (!form.selectedStages[i]) return 0
    const override = form.stageFeeOverrides?.[i]
    if (override && override > 0) return override
    return totalFee * p / fullPct
  })
  const landscapeFee = form.landscapeFee || 0
  return { totalFee, cdmFeeCalc, cdmFee, landscapeFee, stageFees }
}

// ── Timeline calculations ──────────────────────────────────────────────────────
interface StageTimeline {
  stageIdx: number
  startDate: Date
  endDate: Date
  weeks: number
}

function calcTimeline(form: ProposalForm): StageTimeline[] {
  if (!form.startMonth || form.totalWeeks <= 0) return []
  const stagePcts = form.stagePercentages ?? STAGE_PCT
  const selected14 = [1, 2, 3, 4].filter(i => form.selectedStages[i])
  if (selected14.length === 0) return []
  const totalSelectedPct = selected14.reduce((a, i) => a + stagePcts[i], 0)
  const [year, month] = form.startMonth.split('-').map(Number)
  let current = new Date(year, month - 1, 1)
  const result: StageTimeline[] = []
  selected14.forEach((i, idx) => {
    const weeks = idx === selected14.length - 1
      ? Math.max(1, form.totalWeeks - result.reduce((a, r) => a + r.weeks, 0))
      : Math.max(1, Math.round(form.totalWeeks * stagePcts[i] / totalSelectedPct))
    const startDate = new Date(current)
    const endDate = new Date(current.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
    result.push({ stageIdx: i, startDate, endDate, weeks })
    current = endDate
  })
  return result
}

// ── SVG Logo ───────────────────────────────────────────────────────────────────
function FirmLogo({ size = 36, color = 'currentColor' }: { size?: number; color?: string }) {
  const h = size / 2
  return (
    <svg width={size} height={h} viewBox="0 0 48 24" fill="none">
      <polyline points="0,22 12,4 24,16 36,4 48,22" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Page Header ────────────────────────────────────────────────────────────────
function PageHeader({ section, subtitle }: { section: string; subtitle: string }) {
  return (
    <div style={{ padding: '28px 48px 0', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FirmLogo size={28} color={PROP_TEAL} />
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: '#333', letterSpacing: '0.04em' }}>{process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Studio'}</div>
            <div style={{ fontFamily: SANS, fontSize: 9, color: '#888' }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{section}</div>
      </div>
      <div style={{ marginTop: 10, height: 1, background: '#e8e5de' }} />
    </div>
  )
}

// ── Page Footer ────────────────────────────────────────────────────────────────
function PageFooter({ address, pageNum }: { address: string; pageNum: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 24, left: 48, right: 48, display: 'flex', alignItems: 'center', gap: 10 }}>
      <FirmLogo size={18} color='#bbb' />
      <div style={{ flex: 1, height: 1, background: '#e8e5de' }} />
      <div style={{ fontFamily: SANS, fontSize: 8, color: '#aaa', whiteSpace: 'nowrap' }}>
        Architectural Fee Proposal{address ? ` | ${address}` : ''}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 8, color: '#bbb', marginLeft: 8, minWidth: 16, textAlign: 'right' }}>{pageNum}</div>
    </div>
  )
}

// ── PAGE: Cover ────────────────────────────────────────────────────────────────
function CoverPage({ form }: { form: ProposalForm }) {
  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', padding: 48, boxSizing: 'border-box', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Top area — cover photo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {form.coverPhoto ? (
          <div style={{ width: 420, height: 420, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.coverPhoto} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ width: 420, height: 420, borderRadius: '50%', background: '#f0ede7' }} />
        )}
      </div>
      {/* Bottom section */}
      <div style={{ textAlign: 'center', paddingTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <FirmLogo size={48} color="#888" />
        </div>
        {form.address && (
          <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: 30, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444', marginBottom: 8 }}>
            {form.address}
          </div>
        )}
        <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginBottom: 16 }}>
          Architectural Fee Proposal
        </div>
        <div style={{ width: 280, height: 1, background: '#ddd', margin: '0 auto 12px' }} />
        <div style={{ fontFamily: SANS, fontSize: 11, color: '#555', marginBottom: 4 }}>{process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Studio'}</div>
        {form.date && (
          <div style={{ fontFamily: SANS, fontSize: 11, color: '#888' }}>
            {formatDateCover(form.date)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── PAGE: Introduction ─────────────────────────────────────────────────────────
function IntroductionPage({ form, pageNum }: { form: ProposalForm; pageNum: number }) {
  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative' }}>
      <PageHeader section="Introduction" subtitle={`About ${process.env.NEXT_PUBLIC_FIRM_NAME || 'Our Studio'}`} />
      <div style={{ padding: '16px 48px 32px', fontFamily: SANS, fontStyle: 'italic', fontSize: 19, color: PROP_TEAL, lineHeight: 1.5 }}>
        &ldquo;We&apos;re grateful for the chance to work with you on a home that will evolve with your family. The pages that follow trace the route from your current space to somewhere brighter, more generous, and genuinely tuned to the way you live day to day.&rdquo;
      </div>
      <div style={{ padding: '0 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: '#444', lineHeight: 1.6 }}>
          <p style={{ marginBottom: 14 }}>I&apos;m pleased to share this proposal, which sets out our approach to both the design and construction stages.</p>
          <p style={{ marginBottom: 14 }}>Drawing on our experience with private houses, this proposal sets out a clear and confident pathway through each phase of the project. It is informed by close collaboration with the RIBA Plan of Works, as well as trusted contractors and building control.</p>
          <p>I&apos;m excited to take this journey together and to help bring your ideas to life.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#e0ddd7', marginBottom: 8 }} />
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: '#333' }}>Sebastian Elliott</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: '#666' }}>ARB, RIBA, MArch, BA(Hons)</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: '#666' }}>Director</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: '#888', fontStyle: 'italic' }}>RIBA ⚜ Chartered Practice</div>
        </div>
      </div>
      <PageFooter address={form.address} pageNum={pageNum} />
    </div>
  )
}

// ── PAGE: Design Journey ───────────────────────────────────────────────────────
function DesignJourneyPage({ form, pageNum }: { form: ProposalForm; pageNum: number }) {
  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative' }}>
      <PageHeader section="Overview" subtitle="Design Journey" />
      <div style={{ padding: '16px 48px 32px' }}>
        <p style={{ fontFamily: SANS, fontSize: 10.5, color: '#444', lineHeight: 1.6, marginBottom: 48 }}>
          This proposal will guide you through the following stages based on the RIBA plan of works. You will find included deliverables at each stage to ensure the smooth running of the project.
        </p>
        {/* Stage timeline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, marginTop: 24 }}>
          {STAGE_NAMES.map((name, i) => {
            const selected = form.selectedStages[i]
            const isStage5 = i === 5
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 90 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selected && !isStage5 ? PROP_TEAL : 'white',
                    border: isStage5 ? `2px dashed #bbb` : selected ? 'none' : `2px solid #ccc`,
                    color: selected && !isStage5 ? 'white' : isStage5 ? '#aaa' : '#bbb',
                    fontFamily: SANS, fontWeight: 700, fontSize: 16,
                  }}>
                    {i}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 9, color: isStage5 ? '#aaa' : selected ? '#555' : '#bbb', textAlign: 'center', maxWidth: 80, marginTop: 8, lineHeight: 1.3 }}>
                    {name}
                  </div>
                </div>
                {i < 5 && (
                  <div style={{ width: 24, height: 1, borderTop: '1px dashed #bbb', marginBottom: 24, flexShrink: 0 }} />
                )}
                {i === 5 && (
                  <div style={{ fontFamily: SANS, fontSize: 14, color: '#aaa', marginBottom: 24, marginLeft: 4 }}>→</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <PageFooter address={form.address} pageNum={pageNum} />
    </div>
  )
}

// ── Stage content data ─────────────────────────────────────────────────────────
const STAGE_CONTENT: Record<number, { col1: Array<{ title: string; text: string }>; col2: Array<{ title: string; text: string }>; singleCol?: boolean }> = {
  0: {
    singleCol: true,
    col1: [
      { title: 'Initial Consultation', text: 'Brief introductory meeting to understand your project vision and requirements.' },
      { title: 'Site Visit', text: 'Preliminary visit to assess site conditions and opportunities.' },
      { title: 'Feasibility Discussion', text: 'Initial thoughts on project feasibility, budget, and timeline.' },
    ],
    col2: [],
  },
  1: {
    col1: [
      { title: 'Site Appraisal', text: 'Visit the site and carry out an initial appraisal.' },
      { title: 'Site Report', text: 'Prepare a site report advising the Client of any reasonably identifiable previous uses and restrictions. On behalf of the Client, review surveys including: Site plan @ 1:200 scale / Floor plans @ 1:100 scale / Elevations @ 1:100 scale / Sections @ 1:100 scale. Prepare existing plans in a Digital Twin Model.' },
      { title: 'Programme', text: 'Contribute to the development of the Project Programme.' },
      { title: 'Cost', text: 'Assist the Client to determine the Construction Cost.' },
      { title: 'Project Brief', text: 'Assist the Client in developing the initial Project Brief.' },
      { title: 'Procurement', text: 'Assist the Client in identifying the procurement method.' },
      { title: 'Consultant Engagement', text: 'Provide architectural information to the Other Client Appointments as reasonably required to enable them to carry out their services.' },
      { title: 'Sustainability', text: 'Assist the Client in identifying sustainability targets for the Project.' },
    ],
    col2: [
      { title: 'Brief Document', text: 'Provide a report on the feasibility of the Project for the Client\'s approval before progressing to the next stage.' },
    ],
  },
  2: {
    col1: [
      { title: 'Site Appraisal', text: 'Organise a site appraisal with the team. The team may contain: Structural Engineer / Mechanical & Electrical Consultant / Quantity Surveyor / Kitchen Specialist.' },
      { title: 'Architectural Concept', text: 'Initial sketches to test out the spatial requirements, look and feel of the project. Development of Digital Twin Model to provide rendered experience of the design.' },
      { title: 'Three Design Reviews', text: 'Three iterations of proposed plans scheme for review, either in person or online at three separate meetings.' },
      { title: 'Town Planning Services', text: 'Prepare and coordinate a Design and Access Statement. Prepare architectural information to support a planning application to the appropriate planning authority.' },
      { title: 'Cost Plan', text: 'Provide an estimate of costs based on planning documents to keep project within budget in association with Quantity Surveyor.' },
      { title: 'Sustainability', text: 'Identify the sustainability strategy and advise client accordingly.' },
    ],
    col2: [
      { title: 'Concept Design Package', text: 'We will produce a final package for sign-off including: Proposed site plan @ 1:100 scale / Proposed floor plans @ 1:50 scale / Proposed elevations @ 1:50 scale / Proposed sections @ 1:50 scale / An artistic render of the rear elevation.' },
    ],
  },
  3: {
    col1: [
      { title: 'Consultant Coordination', text: 'Coordinate the relevant information received from the Other Client Appointments with the Architect\'s design. Prepare the architectural information in sufficient detail to enable spatial coordination. Provide architectural information to consultants. Undertake third party consultations as reasonably required.' },
      { title: 'Programme', text: 'Comment on the Project Programme.' },
      { title: 'Cost Plan', text: 'Provide architectural information for updating the Construction Cost and review the architectural design development against the latest approved Construction Cost.' },
      { title: 'Principal Designer', text: 'Provide architectural design information and identify the reasonably foreseeable residual health and safety risks to the Principal Designer.' },
      { title: 'Outline Specification', text: 'Prepare an outline specification.' },
      { title: 'Sustainability', text: 'Review and update sustainability strategy.' },
    ],
    col2: [
      { title: 'Building Control', text: 'Coordinate the design according to building regulations. Prepare a building control application and assist the client in appointing an approved inspector.' },
      { title: 'Tender', text: 'Consider with the Client a tenderer or a list of tenderers for the construction works. Collate the architectural and Other Client Appointments\' tender information and issue the tender pack to the Client for its approval. Invite and appraise tender or tenders.' },
    ],
  },
  4: {
    col1: [
      { title: 'Tender', text: 'Assess tenders and proposals as they relate to the architectural design. Prepare the tender report.' },
      { title: 'Consultant Coordination', text: 'Coordinate the relevant information from the Other Client Appointments. Prepare the architectural technical design in sufficient detail to enable a tender to be obtained. Provide architectural information to consultants. Undertake third party consultations as reasonably required.' },
      { title: 'Party Wall Award', text: 'Provide architectural information for the preparation of the party wall awards. Assist the client in sourcing quotes and appointing a party wall surveyor.' },
      { title: 'Programme', text: 'Comment on the Project Programme.' },
      { title: 'Cost Plan', text: 'Provide architectural information for updating the Construction Cost. Review the architectural design developments against the latest approved Construction Cost.' },
      { title: 'Specification', text: 'Prepare the architectural specification. Identify and agree the extent of the technical design to be completed by the Contractor or Specialist Subcontractors.' },
    ],
    col2: [
      { title: 'Building Regulations', text: 'Coordinate the building regulations items in sufficient detail to satisfy the statutory requirements. Coordinate alternative solutions to the building regulations in sufficient detail to satisfy the approved inspector. Specialised consultant reports to be prepared by others.' },
      { title: 'Principal Designer', text: 'Provide architectural design information and identify the reasonably foreseeable residual health and safety risks to the Principal Designer.' },
      { title: 'Sustainability', text: 'Review and update sustainability strategy.' },
      { title: 'Construction Information', text: 'Coordinate the design work prepared by the Contractor and the specialist subcontractors with the Architect\'s design. Provide the architectural information reasonably required for construction.' },
      { title: 'Town Planning Services', text: 'Advise the Client of the planning conditions. Prepare architectural information to support the application to discharge the pre-commencement planning conditions. Submit an application to discharge the pre-commencement planning conditions.' },
    ],
  },
  5: {
    col1: [
      { title: 'Construction Administration', text: 'We recommend a JCT or RIBA standard contract to guarantee the construction programme and finish quality, which the Architect will administer. We will review and approve construction-related documents, such as material samples, shop drawings, and payment requests from the contractor.' },
      { title: 'Consultant Coordination', text: 'Provide architectural information to the Other Client Appointments, as reasonably required, to enable them to carry out their services.' },
      { title: 'Programme', text: 'Comment on the Project Programme.' },
      { title: 'Site Inspections', text: 'Carry out visual site inspections up to a maximum of 2 per month, to review the general progress and quality of the works as they relate to the architectural design and issue site inspection reports to the Client.' },
      { title: 'Site Queries', text: 'Respond within a reasonable time-frame to architectural site queries.' },
      { title: 'Principal Designer', text: 'Provide the Principal Designer or the Principal Contractor with the architectural final construction information for inclusion in the Health & Safety File (under the CDM Regulations 2015).' },
    ],
    col2: [
      { title: 'Operations and Maintenance Manuals', text: 'Review and comment on the operation and maintenance manuals prepared by the Contractor, as they relate to the architectural design.' },
      { title: 'Statutory Consents', text: 'Provide the Client with the original copy of any notices, consents or approvals in connection with planning, building control and other relevant statutory approvals.' },
      { title: 'Manufacturer\'s Maintenance Instructions', text: 'Request manufacturers\' maintenance instructions or leaflets from the Contractor and provide to the Client.' },
      { title: 'Town Planning Services', text: 'Prepare architectural information to support the application to discharge the construction-stage and the pre-occupancy planning conditions. Submit an application to the appropriate planning authority to discharge the construction-stage and the pre-occupancy planning conditions.' },
    ],
  },
}

// ── PAGE: RIBA Stage ───────────────────────────────────────────────────────────
function StagePage({ stageIdx, form, pageNum, stageFee }: { stageIdx: number; form: ProposalForm; pageNum: number; stageFee: number }) {
  const content = STAGE_CONTENT[stageIdx]
  const timelines = calcTimeline(form)
  const tl = timelines.find(t => t.stageIdx === stageIdx)
  const weeksLabel = stageIdx === 5 ? 'Time TBC' : tl ? `${tl.weeks} Week${tl.weeks !== 1 ? 's' : ''}` : 'TBC'
  const feeLabel = stageIdx === 0 ? 'Complimentary' : stageIdx === 5 ? 'NIC' : stageFee > 0 ? gbp(stageFee) : '—'

  const leftBg = stageIdx === 0 ? '#e8e8e8' : stageIdx === 5 ? '#d6ede8' : PROP_TEAL
  const leftTextColor = stageIdx === 0 ? '#555' : 'white'

  const ContentCol = ({ items }: { items: Array<{ title: string; text: string }> }) => (
    <div>
      {items.map((item, k) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: '#333', marginBottom: 2 }}>{item.title}</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: '#555', marginLeft: 12, lineHeight: 1.5 }}>
            {'• '}{item.text}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative' }}>
      <PageHeader section={`RIBA Stage ${stageIdx}`} subtitle={STAGE_NAMES[stageIdx]} />
      <div style={{ padding: '16px 48px 64px', display: 'flex', gap: 20 }}>
        {/* Left box */}
        <div style={{ width: 150, flexShrink: 0, background: leftBg, borderRadius: 8, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SANS, fontSize: 48, fontWeight: 700, color: leftTextColor, lineHeight: 1 }}>{stageIdx}</div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: leftTextColor, opacity: 0.85 }}>{STAGE_SHORT[stageIdx]}</div>
          <div style={{ height: 1, background: stageIdx === 0 ? '#ccc' : 'rgba(255,255,255,0.3)', margin: '4px 0' }} />
          <div style={{ fontFamily: SANS, fontSize: 11, color: leftTextColor, opacity: 0.9 }}>{weeksLabel}</div>
          <div style={{ fontFamily: SANS, fontSize: 16, color: leftTextColor, fontWeight: 400 }}>{feeLabel}</div>
        </div>
        {/* Right content */}
        <div style={{ flex: 1 }}>
          {content?.singleCol ? (
            <ContentCol items={content.col1} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <ContentCol items={content?.col1 || []} />
              <ContentCol items={content?.col2 || []} />
            </div>
          )}
        </div>
      </div>
      <PageFooter address={form.address} pageNum={pageNum} />
    </div>
  )
}

// ── PAGE: Gantt ────────────────────────────────────────────────────────────────
function GanttPage({ form, pageNum }: { form: ProposalForm; pageNum: number }) {
  const timelines = calcTimeline(form)
  if (timelines.length === 0) return null

  const [startY, startMo] = form.startMonth.split('-').map(Number)
  const totalMonths = Math.ceil(form.totalWeeks / 4.33)

  const months: { label: string; date: Date }[] = []
  for (let i = 0; i < totalMonths + 1; i++) {
    const d = new Date(startY, startMo - 1 + i, 1)
    months.push({ label: d.toLocaleString('default', { month: 'short' }), date: d })
  }

  const rangeStart = new Date(startY, startMo - 1, 1)
  const rangeEnd = new Date(rangeStart.getTime() + (form.totalWeeks * 7 + 30) * 24 * 60 * 60 * 1000)
  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const toPct = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100))

  // Sequential meeting counter
  let meetingCounter = 1

  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative' }}>
      <PageHeader section="Architectural Proposal" subtitle="Design Timeline" />
      <div style={{ padding: '16px 48px 64px' }}>
        {/* Year label */}
        <div style={{ textAlign: 'center', fontFamily: SANS, fontSize: 18, color: '#555', marginBottom: 16 }}>
          {startY}
        </div>
        {/* Month headers */}
        <div style={{ display: 'flex', marginLeft: 120, marginBottom: 4 }}>
          {months.map((m, i) => (
            <div key={i} style={{ flex: 1, fontFamily: SANS, fontSize: 9, color: '#888', textAlign: 'center' }}>{m.label}</div>
          ))}
        </div>
        {/* Stage rows */}
        {timelines.map((tl) => {
          const meetings = form.meetingsPerStage[tl.stageIdx] || 0
          const leftPct = toPct(tl.startDate)
          const rightPct = toPct(tl.endDate)
          const widthPct = rightPct - leftPct
          const meetingNums: number[] = []
          for (let m = 0; m < meetings; m++) {
            meetingNums.push(meetingCounter++)
          }
          return (
            <div key={tl.stageIdx} style={{ display: 'flex', alignItems: 'center', marginBottom: 16, height: 32 }}>
              {/* Label */}
              <div style={{ width: 120, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: PROP_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: SANS, fontSize: 9, color: 'white', fontWeight: 700 }}>{tl.stageIdx}</span>
                </div>
                <span style={{ fontFamily: SANS, fontSize: 9, color: '#555', lineHeight: 1.2 }}>{STAGE_SHORT[tl.stageIdx]}</span>
              </div>
              {/* Bar area */}
              <div style={{ flex: 1, position: 'relative', height: 20 }}>
                {/* Month gridlines */}
                {months.slice(1).map((m, gi) => (
                  <div key={gi} style={{ position: 'absolute', left: `${toPct(m.date)}%`, top: 0, bottom: 0, width: 1, background: '#e5e5e5', zIndex: 0 }} />
                ))}
                <div style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, height: '100%', background: PROP_TEAL, borderRadius: 4, minWidth: 8, zIndex: 1 }} />
                {meetingNums.map((num, mi) => {
                  const pinPct = leftPct + (widthPct * (mi + 1)) / (meetingNums.length + 1)
                  return (
                    <div key={mi} style={{ position: 'absolute', left: `${pinPct}%`, bottom: 'calc(100% + 4px)', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', border: '1.5px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: SANS, fontSize: 8, color: '#333' }}>{num}</span>
                      </div>
                      <div style={{ width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '4px solid #666' }} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {/* Legend */}
        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', border: '1.5px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: SANS, fontSize: 8, color: '#333' }}>1</span>
            </div>
            <div style={{ width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '4px solid #666' }} />
          </div>
          <span style={{ fontFamily: SANS, fontSize: 9, color: '#888' }}>Client Meeting</span>
        </div>
        <div style={{ marginTop: 20, fontFamily: SANS, fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>
          Please note the timeline is indicative.
        </div>
      </div>
      <PageFooter address={form.address} pageNum={pageNum} />
    </div>
  )
}

// ── PAGE: Fee Breakdown ────────────────────────────────────────────────────────
function FeeBreakdownPage({ form, pageNum }: { form: ProposalForm; pageNum: number }) {
  const { totalFee, cdmFee, stageFees } = calcFees(form)
  const selectedStages = form.selectedStages.map((s, i) => ({ selected: s, idx: i })).filter(s => s.selected)
  const baseTotal = stageFees.reduce((a, b) => a + b, 0)

  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative' }}>
      <PageHeader section="Architectural Proposal" subtitle="Breakdown of Fees" />
      <div style={{ padding: '16px 48px 64px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        {/* Left: Base Package */}
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: '#333', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Base Package</div>
          <div>
            {selectedStages.map(({ idx }) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid #f0ede7` }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: idx === 0 ? '#e8e8e8' : idx === 5 ? '#d6ede8' : PROP_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: SANS, fontSize: 9, color: idx === 0 ? '#555' : 'white', fontWeight: 700 }}>{idx}</span>
                </div>
                <span style={{ fontFamily: SANS, fontSize: 10, color: '#444', flex: 1 }}>{STAGE_NAMES[idx]}</span>
                <span style={{ fontFamily: SANS, fontSize: 10, color: '#333', textAlign: 'right', minWidth: 70 }}>
                  {idx === 0 ? 'Complimentary' : idx === 5 ? 'NIC' : gbp(stageFees[idx])}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4 }}>
              <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: '#333' }}>Total</span>
              <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: PROP_TEAL }}>{gbp(baseTotal)}</span>
            </div>
          </div>
        </div>
        {/* Right: Optional Items */}
        <div>
          <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: '#333', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Optional Items</div>
          <p style={{ fontFamily: SANS, fontSize: 10, color: '#666', marginBottom: 16, lineHeight: 1.5 }}>
            Additional architectural services can be added as per below.
          </p>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid #f0ede7` }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: form.includeCDM ? '#333' : '#999' }}>
                CDM (Health & Safety)
                {!form.includeCDM && <span style={{ fontStyle: 'italic', color: '#bbb' }}> — available</span>}
              </span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: form.includeCDM ? PROP_TEAL : '#bbb' }}>
                {form.includeCDM ? gbp(cdmFee) : 'TBC'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid #f0ede7` }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: '#999' }}>Interior Design</span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: '#bbb' }}>TBC</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid #f0ede7` }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: '#999' }}>Landscape Design</span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: '#bbb' }}>£1,250</span>
            </div>
          </div>
        </div>
      </div>
      {/* Terms */}
      <div style={{ padding: '0 48px 64px' }}>
        <div style={{ borderTop: `1px solid #f0ede7`, paddingTop: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Terms & Conditions</div>
          {[
            'Appointment Documents to be signed prior to commencement.',
            'Upfront payment of stage 1 required prior to commencement.',
            'Payments to be issued at the end of each month based on stage progress. To be paid within 7 days.',
          ].map((t, i) => (
            <p key={i} style={{ fontFamily: SANS, fontSize: 9, color: '#666', marginBottom: 4, lineHeight: 1.5 }}>• {t}</p>
          ))}
        </div>
      </div>
      <PageFooter address={form.address} pageNum={pageNum} />
    </div>
  )
}

// ── PAGE: Back Cover ───────────────────────────────────────────────────────────
function BackCoverPage() {
  return (
    <div style={{ width: PAGE_W, height: PAGE_H, background: 'white', boxSizing: 'border-box', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginTop: 350, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <FirmLogo size={64} color={PROP_TEAL} />
        <div style={{ fontFamily: SANS, fontSize: 28, color: '#333', marginTop: 24 }}>{process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Firm Name'}</div>
        <div style={{ lineHeight: 2, textAlign: 'center', marginTop: 8 }}>
          {[process.env.NEXT_PUBLIC_FIRM_PHONE, process.env.NEXT_PUBLIC_FIRM_EMAIL, process.env.NEXT_PUBLIC_FIRM_WEBSITE, process.env.NEXT_PUBLIC_FIRM_SOCIAL].filter(Boolean).map((line, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 11, color: '#666' }}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Preview wrapper ────────────────────────────────────────────────────────────
function ProposalPreview({ form }: { form: ProposalForm }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.58)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setScale(entry.contentRect.width / PAGE_W)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const { stageFees } = calcFees(form)
  const timelines = calcTimeline(form)
  const showGantt = timelines.length > 0 && !!form.startMonth && form.totalWeeks > 0

  const pages: React.ReactNode[] = []
  let pageNum = 1

  pages.push(<CoverPage key="cover" form={form} />)
  pages.push(<IntroductionPage key="intro" form={form} pageNum={++pageNum} />)
  pages.push(<DesignJourneyPage key="journey" form={form} pageNum={++pageNum} />)

  for (let i = 0; i <= 5; i++) {
    if (form.selectedStages[i]) {
      pages.push(<StagePage key={`stage-${i}`} stageIdx={i} form={form} pageNum={++pageNum} stageFee={stageFees[i]} />)
    }
  }

  if (showGantt) {
    pages.push(<GanttPage key="gantt" form={form} pageNum={++pageNum} />)
  }

  pages.push(<FeeBreakdownPage key="fee" form={form} pageNum={++pageNum} />)
  pages.push(<BackCoverPage key="back" />)

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Google Fonts — Raleway approximates Brandon Grotesque */}
      <style>{`@import url('${FONTS_URL}');`}</style>
      {pages.map((page, i) => (
        <div key={i} style={{ width: PAGE_W * scale, height: PAGE_H * scale, overflow: 'hidden', marginBottom: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', position: 'relative' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {page}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Print HTML generator ───────────────────────────────────────────────────────
function generatePrintHTML(form: ProposalForm): string {
  const { stageFees, totalFee, cdmFee } = calcFees(form)
  const timelines = calcTimeline(form)
  const showGantt = timelines.length > 0 && !!form.startMonth && form.totalWeeks > 0

  const logoSVG = (size: number, color: string) =>
    `<svg width="${size}" height="${size / 2}" viewBox="0 0 48 24" fill="none"><polyline points="0,22 12,4 24,16 36,4 48,22" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`

  const header = (section: string, subtitle: string) => `
    <div style="padding:28px 48px 0;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${logoSVG(28, PROP_TEAL)}
          <div>
            <div style="font-family:'Raleway',sans-serif;font-size:10px;font-weight:600;color:#333;letter-spacing:0.04em;">${process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Studio'}</div>
            <div style="font-family:'Raleway',sans-serif;font-size:9px;color:#888;">${subtitle}</div>
          </div>
        </div>
        <div style="font-family:'Raleway',sans-serif;font-size:9px;font-weight:600;color:#999;letter-spacing:0.08em;text-transform:uppercase;">${section}</div>
      </div>
      <div style="margin-top:10px;height:1px;background:#e8e5de;"></div>
    </div>`

  const footer = (pageNum: number) => `
    <div style="position:absolute;bottom:24px;left:48px;right:48px;display:flex;align-items:center;gap:10px;">
      ${logoSVG(18, '#bbb')}
      <div style="flex:1;height:1px;background:#e8e5de;"></div>
      <div style="font-family:'Raleway',sans-serif;font-size:8px;color:#aaa;white-space:nowrap;">Architectural Fee Proposal${form.address ? ` | ${form.address}` : ''}</div>
      <div style="font-family:'Raleway',sans-serif;font-size:8px;color:#bbb;margin-left:8px;">${pageNum}</div>
    </div>`

  const pages: string[] = []
  let pageNum = 1

  // Cover
  pages.push(`
    <div class="page" style="display:flex;flex-direction:column;padding:48px;background:white;position:relative;">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;">
        ${form.coverPhoto
          ? `<div style="width:420px;height:420px;border-radius:50%;overflow:hidden;"><img src="${form.coverPhoto}" style="width:100%;height:100%;object-fit:cover;"/></div>`
          : `<div style="width:420px;height:420px;border-radius:50%;background:#f0ede7;"></div>`}
      </div>
      <div style="text-align:center;padding-top:32px;">
        <div style="display:flex;justify-content:center;margin-bottom:18px;">${logoSVG(48, '#888')}</div>
        ${form.address ? `<div style="font-family:'Raleway',sans-serif;font-weight:300;font-size:30px;text-transform:uppercase;letter-spacing:0.08em;color:#444;margin-bottom:8px;">${form.address}</div>` : ''}
        <div style="font-family:'Raleway',sans-serif;font-weight:300;font-size:22px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:16px;">Architectural Fee Proposal</div>
        <div style="width:280px;height:1px;background:#ddd;margin:0 auto 12px;"></div>
        <div style="font-family:'Raleway',sans-serif;font-size:11px;color:#555;margin-bottom:4px;">${process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Studio'}</div>
        <div style="font-family:'Raleway',sans-serif;font-size:11px;color:#888;">${form.date ? formatDateCover(form.date) : ''}</div>
      </div>
    </div>`)

  // Introduction
  pages.push(`
    <div class="page" style="background:white;position:relative;">
      ${header('Introduction', `About ${process.env.NEXT_PUBLIC_FIRM_NAME || 'Our Studio'}`)}
      <div style="padding:16px 48px 32px;font-family:'Raleway',sans-serif;font-style:italic;font-size:19px;color:${PROP_TEAL};line-height:1.5;">
        &ldquo;We&rsquo;re grateful for the chance to work with you on a home that will evolve with your family. The pages that follow trace the route from your current space to somewhere brighter, more generous, and genuinely tuned to the way you live day to day.&rdquo;
      </div>
      <div style="padding:0 48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        <div style="font-family:'Raleway',sans-serif;font-size:10.5px;color:#444;line-height:1.6;">
          <p style="margin-bottom:14px;">I&rsquo;m pleased to share this proposal, which sets out our approach to both the design and construction stages.</p>
          <p style="margin-bottom:14px;">Drawing on our experience with private houses, this proposal sets out a clear and confident pathway through each phase of the project. It is informed by close collaboration with the RIBA Plan of Works, as well as trusted contractors and building control.</p>
          <p>I&rsquo;m excited to take this journey together and to help bring your ideas to life.</p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;">
          <div style="width:100px;height:100px;border-radius:50%;background:#e0ddd7;margin-bottom:8px;"></div>
          <div style="font-family:'Raleway',sans-serif;font-size:11px;font-weight:700;color:#333;">Sebastian Elliott</div>
          <div style="font-family:'Raleway',sans-serif;font-size:10px;color:#666;">ARB, RIBA, MArch, BA(Hons)</div>
          <div style="font-family:'Raleway',sans-serif;font-size:10px;color:#666;">Director</div>
          <div style="font-family:'Raleway',sans-serif;font-size:10px;color:#888;font-style:italic;">RIBA &#10052; Chartered Practice</div>
        </div>
      </div>
      ${footer(++pageNum)}
    </div>`)

  // Design Journey
  const circlesHTML = STAGE_NAMES.map((name, i) => {
    const selected = form.selectedStages[i]
    const isStage5 = i === 5
    const circleStyle = `width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-family:'Raleway',sans-serif;font-weight:700;font-size:16px;background:${selected && !isStage5 ? PROP_TEAL : 'white'};border:${isStage5 ? '2px dashed #bbb' : selected ? 'none' : '2px solid #ccc'};color:${selected && !isStage5 ? 'white' : isStage5 ? '#aaa' : '#bbb'};`
    return `
      <div style="display:flex;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;width:90px;">
          <div style="${circleStyle}">${i}</div>
          <div style="font-family:'Raleway',sans-serif;font-size:9px;color:${isStage5 ? '#aaa' : selected ? '#555' : '#bbb'};text-align:center;max-width:80px;margin-top:8px;line-height:1.3;">${name}</div>
        </div>
        ${i < 5 ? `<div style="width:24px;height:1px;border-top:1px dashed #bbb;margin-bottom:24px;flex-shrink:0;"></div>` : `<div style="font-family:'Raleway',sans-serif;font-size:14px;color:#aaa;margin-bottom:24px;margin-left:4px;">&#8594;</div>`}
      </div>`
  }).join('')

  pages.push(`
    <div class="page" style="background:white;position:relative;">
      ${header('Overview', 'Design Journey')}
      <div style="padding:16px 48px 32px;">
        <p style="font-family:'Raleway',sans-serif;font-size:10.5px;color:#444;line-height:1.6;margin-bottom:48px;">
          This proposal will guide you through the following stages based on the RIBA plan of works. You will find included deliverables at each stage to ensure the smooth running of the project.
        </p>
        <div style="display:flex;align-items:flex-start;justify-content:center;margin-top:24px;">
          ${circlesHTML}
        </div>
      </div>
      ${footer(++pageNum)}
    </div>`)

  // Stage pages
  for (let i = 0; i <= 5; i++) {
    if (!form.selectedStages[i]) continue
    const content = STAGE_CONTENT[i]
    const tl = timelines.find(t => t.stageIdx === i)
    const weeksLabel = i === 5 ? 'Time TBC' : tl ? `${tl.weeks} Week${tl.weeks !== 1 ? 's' : ''}` : 'TBC'
    const feeLabel = i === 0 ? 'Complimentary' : i === 5 ? 'NIC' : stageFees[i] > 0 ? gbp(stageFees[i]) : '&mdash;'
    const leftBg = i === 0 ? '#e8e8e8' : i === 5 ? '#d6ede8' : PROP_TEAL
    const leftTextColor = i === 0 ? '#555' : 'white'

    const renderItems = (items: Array<{ title: string; text: string }>) =>
      items.map(item => `
        <div style="margin-bottom:10px;">
          <div style="font-family:'Raleway',sans-serif;font-size:10.5px;font-weight:700;color:#333;margin-bottom:2px;">${item.title}</div>
          <div style="font-family:'Raleway',sans-serif;font-size:10px;color:#555;margin-left:12px;line-height:1.5;">&bull; ${item.text}</div>
        </div>`).join('')

    const rightContent = content?.singleCol
      ? renderItems(content.col1)
      : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
           <div>${renderItems(content?.col1 || [])}</div>
           <div>${renderItems(content?.col2 || [])}</div>
         </div>`

    pages.push(`
      <div class="page" style="background:white;position:relative;">
        ${header(`RIBA Stage ${i}`, STAGE_NAMES[i])}
        <div style="padding:16px 48px 64px;display:flex;gap:20px;">
          <div style="width:150px;flex-shrink:0;background:${leftBg};border-radius:8px;padding:20px 16px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-family:'Raleway',sans-serif;font-size:48px;font-weight:700;color:${leftTextColor};line-height:1;">${i}</div>
            <div style="font-family:'Raleway',sans-serif;font-size:10px;color:${leftTextColor};opacity:0.85;">${STAGE_SHORT[i]}</div>
            <div style="height:1px;background:${i === 0 ? '#ccc' : 'rgba(255,255,255,0.3)'};margin:4px 0;"></div>
            <div style="font-family:'Raleway',sans-serif;font-size:11px;color:${leftTextColor};opacity:0.9;">${weeksLabel}</div>
            <div style="font-family:'Raleway',sans-serif;font-size:16px;color:${leftTextColor};">${feeLabel}</div>
          </div>
          <div style="flex:1;">${rightContent}</div>
        </div>
        ${footer(++pageNum)}
      </div>`)
  }

  // Gantt
  if (showGantt) {
    const [startY2, startMo2] = form.startMonth.split('-').map(Number)
    const totalMonthsG = Math.ceil(form.totalWeeks / 4.33)
    const months2: { label: string }[] = []
    for (let i = 0; i < totalMonthsG + 1; i++) {
      const d = new Date(startY2, startMo2 - 1 + i, 1)
      months2.push({ label: d.toLocaleString('default', { month: 'short' }) })
    }
    const rangeStart2 = new Date(startY2, startMo2 - 1, 1)
    const rangeEnd2 = new Date(rangeStart2.getTime() + (form.totalWeeks * 7 + 30) * 24 * 60 * 60 * 1000)
    const totalMs2 = rangeEnd2.getTime() - rangeStart2.getTime()
    const toPct2 = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - rangeStart2.getTime()) / totalMs2 * 100))

    let meetingCounterG = 1
    const rowsHTML = timelines.map(tl => {
      const meetings = form.meetingsPerStage[tl.stageIdx] || 0
      const leftPct = toPct2(tl.startDate)
      const widthPct = toPct2(tl.endDate) - leftPct
      const pins = Array.from({ length: meetings }, (_, mi) => {
        const pinPct = leftPct + (widthPct * (mi + 1)) / (meetings + 1)
        const num = meetingCounterG++
        return `<div style="position:absolute;left:${pinPct}%;bottom:calc(100% + 4px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;z-index:2;"><div style="width:16px;height:16px;border-radius:50%;background:white;border:1.5px solid #444;display:flex;align-items:center;justify-content:center;"><span style="font-family:'Raleway',sans-serif;font-size:8px;color:#333;">${num}</span></div><div style="width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4px solid #666;"></div></div>`
      }).join('')
      return `
        <div style="display:flex;align-items:center;margin-bottom:16px;height:32px;">
          <div style="width:120px;flex-shrink:0;display:flex;align-items:center;gap:6px;padding-right:8px;">
            <div style="width:20px;height:20px;border-radius:50%;background:${PROP_TEAL};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="font-family:'Raleway',sans-serif;font-size:9px;color:white;font-weight:700;">${tl.stageIdx}</span>
            </div>
            <span style="font-family:'Raleway',sans-serif;font-size:9px;color:#555;">${STAGE_SHORT[tl.stageIdx]}</span>
          </div>
          <div style="flex:1;position:relative;height:20px;">
            <div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${PROP_TEAL};border-radius:4px;min-width:8px;"></div>
            ${pins}
          </div>
        </div>`
    }).join('')

    pages.push(`
      <div class="page" style="background:white;position:relative;">
        ${header('Architectural Proposal', 'Design Timeline')}
        <div style="padding:16px 48px 64px;">
          <div style="text-align:center;font-family:'Raleway',sans-serif;font-size:18px;color:#555;margin-bottom:16px;">${startY2}</div>
          <div style="display:flex;margin-left:120px;margin-bottom:4px;">
            ${months2.map(m => `<div style="flex:1;font-family:'Raleway',sans-serif;font-size:9px;color:#888;text-align:center;">${m.label}</div>`).join('')}
          </div>
          ${rowsHTML}
          <div style="margin-top:24px;display:flex;align-items:center;gap:12px;">
            <div style="display:flex;flex-direction:column;align-items:center;"><div style="width:16px;height:16px;border-radius:50%;background:white;border:1.5px solid #444;display:flex;align-items:center;justify-content:center;"><span style="font-family:'Raleway',sans-serif;font-size:8px;color:#333;">1</span></div><div style="width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4px solid #666;"></div></div>
            <span style="font-family:'Raleway',sans-serif;font-size:9px;color:#888;">Client Meeting</span>
          </div>
          <div style="margin-top:20px;font-family:'Raleway',sans-serif;font-size:9px;color:#aaa;font-style:italic;">Please note the timeline is indicative.</div>
        </div>
        ${footer(++pageNum)}
      </div>`)
  }

  // Fee Breakdown
  const selectedStages2 = form.selectedStages.map((s, i) => ({ selected: s, idx: i })).filter(s => s.selected)
  const baseTotal2 = stageFees.reduce((a, b) => a + b, 0)
  const feeRowsHTML = selectedStages2.map(({ idx }) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0ede7;">
      <div style="width:24px;height:24px;border-radius:50%;background:${idx === 0 ? '#e8e8e8' : idx === 5 ? '#d6ede8' : PROP_TEAL};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-family:'Raleway',sans-serif;font-size:9px;color:${idx === 0 ? '#555' : 'white'};font-weight:700;">${idx}</span>
      </div>
      <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#444;flex:1;">${STAGE_NAMES[idx]}</span>
      <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#333;text-align:right;min-width:70px;">${idx === 0 ? 'Complimentary' : idx === 5 ? 'NIC' : gbp(stageFees[idx])}</span>
    </div>`).join('')

  pages.push(`
    <div class="page" style="background:white;position:relative;">
      ${header('Architectural Proposal', 'Breakdown of Fees')}
      <div style="padding:16px 48px 32px;display:grid;grid-template-columns:1fr 1fr;gap:40px;">
        <div>
          <div style="font-family:'Raleway',sans-serif;font-size:10.5px;font-weight:700;color:#333;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.06em;">Base Package</div>
          ${feeRowsHTML}
          <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:4px;">
            <span style="font-family:'Raleway',sans-serif;font-size:10.5px;font-weight:700;color:#333;">Total</span>
            <span style="font-family:'Raleway',sans-serif;font-size:10.5px;font-weight:700;color:${PROP_TEAL};">${gbp(baseTotal2)}</span>
          </div>
        </div>
        <div>
          <div style="font-family:'Raleway',sans-serif;font-size:10.5px;font-weight:700;color:#333;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em;">Optional Items</div>
          <p style="font-family:'Raleway',sans-serif;font-size:10px;color:#666;margin-bottom:16px;line-height:1.5;">Additional architectural services can be added as per below.</p>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede7;">
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:${form.includeCDM ? '#333' : '#999'};">CDM (Health &amp; Safety)${!form.includeCDM ? '<span style="font-style:italic;color:#bbb;"> &mdash; available</span>' : ''}</span>
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:${form.includeCDM ? PROP_TEAL : '#bbb'};">${form.includeCDM ? gbp(cdmFee) : 'TBC'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede7;">
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#999;">Interior Design</span>
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#bbb;">TBC</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede7;">
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#999;">Landscape Design</span>
            <span style="font-family:'Raleway',sans-serif;font-size:10px;color:#bbb;">&pound;1,250</span>
          </div>
        </div>
      </div>
      <div style="padding:0 48px 64px;">
        <div style="border-top:1px solid #f0ede7;padding-top:16px;">
          <div style="font-family:'Raleway',sans-serif;font-size:9px;font-weight:700;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em;">Terms &amp; Conditions</div>
          ${['Appointment Documents to be signed prior to commencement.', 'Upfront payment of stage 1 required prior to commencement.', 'Payments to be issued at the end of each month based on stage progress. To be paid within 7 days.'].map(t => `<p style="font-family:'Raleway',sans-serif;font-size:9px;color:#666;margin-bottom:4px;line-height:1.5;">&bull; ${t}</p>`).join('')}
        </div>
      </div>
      ${footer(++pageNum)}
    </div>`)

  // Back Cover
  pages.push(`
    <div class="page" style="background:white;position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="margin-top:350px;display:flex;flex-direction:column;align-items:center;gap:8px;">
        ${logoSVG(64, PROP_TEAL)}
        <div style="font-family:'Raleway',sans-serif;font-size:28px;color:#333;margin-top:24px;">${process.env.NEXT_PUBLIC_FIRM_NAME || 'Your Firm Name'}</div>
        <div style="line-height:2;text-align:center;margin-top:8px;">
          ${[process.env.NEXT_PUBLIC_FIRM_PHONE, process.env.NEXT_PUBLIC_FIRM_EMAIL, process.env.NEXT_PUBLIC_FIRM_WEBSITE, process.env.NEXT_PUBLIC_FIRM_SOCIAL].filter(Boolean).map(line => `<div style="font-family:'Raleway',sans-serif;font-size:11px;color:#666;">${line}</div>`).join('')}
        </div>
      </div>
    </div>`)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Fee Proposal</title>
<link href="${FONTS_URL}" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; }
  @page { size: A3 landscape; margin: 0; }
  .page { width: 1191px; height: 842px; page-break-after: always; overflow: hidden; position: relative; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`
}

// ── Form input helpers ─────────────────────────────────────────────────────────
const inputStyle = { border: `1px solid ${BORDER}`, background: CREAM, outline: 'none' }

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontFamily: SANS, fontSize: 11, color: `${INK}60`, display: 'block', marginBottom: 4 }}>{children}</label>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
      <div className="px-4 py-2.5" style={{ background: CREAM, borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: `${INK}40` }}>{title}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
function ProposalBuilder() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectIdParam = searchParams.get('project_id') || ''
  const proposalIdParam = searchParams.get('id') || ''

  const [form, setForm] = useState<ProposalForm>({ ...DEFAULT_FORM, projectId: projectIdParam })
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string; client?: { name: string }; client_id?: string }>>([])
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(proposalIdParam)
  const [saveMsg, setSaveMsg] = useState('')

  // Email auto-fill
  const [emailOpen,    setEmailOpen]    = useState(false)
  const [emailQuery,   setEmailQuery]   = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailResult,  setEmailResult]  = useState<Record<string, any> | null>(null)
  const [emailError,   setEmailError]   = useState<string | null>(null)

  const set = useCallback(<K extends keyof ProposalForm>(key: K, value: ProposalForm[K]) => {
    setForm(f => ({ ...f, [key]: value }))
  }, [])

  // Load projects
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(Array.isArray(data) ? data : []))
  }, [])

  // Load existing proposal
  useEffect(() => {
    if (!proposalIdParam) return
    fetch(`/api/proposals`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load proposals')
        return r.json()
      })
      .then((proposals: Array<{ id: string; form_data: ProposalForm }>) => {
        const found = proposals.find(p => p.id === proposalIdParam)
        if (!found?.form_data) throw new Error('Proposal not found')
        setForm({ ...DEFAULT_FORM, ...found.form_data })
      })
      .catch(() => {
        alert('Could not load this proposal — returning to the list so nothing gets overwritten.')
        router.replace('/proposals')
      })
  }, [proposalIdParam, router])

  // When project selected, populate client name + address
  function handleProjectSelect(id: string) {
    set('projectId', id)
    const proj = projects.find(p => p.id === id)
    if (proj?.client?.name) set('clientName', proj.client.name)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      if (savedId) {
        const r = await fetch('/api/proposals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, project_id: form.projectId || null, form_data: form, status: 'draft' }),
        })
        if (!r.ok) { setSaveMsg('Save failed'); return }
        setSaveMsg('Saved')
      } else {
        const r = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: form.projectId || null, form_data: form, status: 'draft' }),
        })
        if (!r.ok) { setSaveMsg('Save failed'); return }
        const data = await r.json()
        if (data.id) {
          setSavedId(data.id)
          router.replace(`/proposals/new?id=${data.id}`)
          setSaveMsg('Saved')
        }
      }
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 2000)
    }
  }

  function handlePrint() {
    const html = generatePrintHTML(form)
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.addEventListener('load', () => {
      setTimeout(() => w.print(), 500)
    })
  }

  const [pdfLoading, setPdfLoading] = useState(false)

  async function handleDownloadPDF() {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/proposals/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `MMA ${(form.address || 'Proposal').replace(/[^a-zA-Z0-9\s]/g, '').trim()}_Fee Proposal.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to generate PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleEmailExtract() {
    if (!emailQuery.trim()) return
    setEmailLoading(true)
    setEmailError(null)
    setEmailResult(null)
    try {
      const res = await fetch('/api/proposals/extract-from-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: emailQuery.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      setEmailResult(data)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEmailLoading(false)
    }
  }

  function applyEmailResult(result: Record<string, any>) {
    if (result.clientName)       set('clientName',       result.clientName)
    if (result.address)          set('address',          result.address)
    if (result.constructionCost) set('constructionCost', result.constructionCost)
    if (result.feePercent)       set('feePercent',       result.feePercent)
    if (result.date)             set('date',             result.date)
    if (Array.isArray(result.selectedStages) && result.selectedStages.length) {
      const stages = [false, false, false, false, false, false]
      result.selectedStages.forEach((s: number) => { if (s >= 0 && s <= 5) stages[s] = true })
      set('selectedStages', stages)
    }
    if (result.stagePercentages && typeof result.stagePercentages === 'object') {
      const pcts = [...(form.stagePercentages ?? [])]
      Object.entries(result.stagePercentages).forEach(([k, v]) => {
        const idx = parseInt(k)
        if (idx >= 0 && idx <= 5 && typeof v === 'number') pcts[idx] = v
      })
      set('stagePercentages', pcts)
    }
    setEmailOpen(false)
    setEmailResult(null)
    setEmailQuery('')
  }

  const { totalFee, cdmFee, cdmFeeCalc, stageFees } = calcFees(form)
  const hasTimeline = form.selectedStages.some((s, i) => s && i >= 1 && i <= 4)

  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#F7F6F2' }}>
      {/* ── Left panel: Form ── */}
      <div style={{ width: isMobile ? '100%' : '42%', flexShrink: 0, overflowY: 'auto', padding: '16px', borderRight: `1px solid ${BORDER}`, display: isMobile && showMobilePreview ? 'none' : 'block' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' as const }}>
          <div>
            <button onClick={() => router.back()} style={{ fontFamily: SANS, fontSize: 11, color: `${INK}50`, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', marginBottom: 6 }}>← Back</button>
            <h1 style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>
              {savedId ? 'Edit Proposal' : 'New Proposal'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
            {saveMsg && <span style={{ fontFamily: SANS, fontSize: 11, color: TEAL_DARK }}>{saveMsg}</span>}
            {isMobile && (
              <button onClick={() => setShowMobilePreview(true)} style={{ height: 34, padding: '0 14px', borderRadius: 10, fontFamily: SANS, fontSize: 12, cursor: 'pointer', border: `1px solid ${BORDER}`, color: `${INK}70`, background: 'white' }}>
                Preview
              </button>
            )}
            <button onClick={handleDownloadPDF} disabled={pdfLoading} style={{ height: 34, padding: '0 14px', borderRadius: 10, fontFamily: SANS, fontSize: 12, cursor: pdfLoading ? 'default' : 'pointer', border: `1px solid ${TEAL}`, color: TEAL, background: 'white', opacity: pdfLoading ? 0.7 : 1, fontWeight: 600 }}>
              {pdfLoading ? 'Generating…' : 'Download PDF'}
            </button>
{!isMobile && (
              <button onClick={handlePrint} style={{ height: 34, padding: '0 14px', borderRadius: 10, fontFamily: SANS, fontSize: 12, cursor: 'pointer', border: `1px solid ${BORDER}`, color: `${INK}70`, background: 'white' }}>
                Print / PDF
              </button>
            )}
            <button onClick={handleSave} disabled={saving} style={{ height: 34, padding: '0 16px', borderRadius: 10, fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: TEAL, color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Auto-fill from email */}
        <div style={{ marginBottom: 16 }}>
          {!emailOpen ? (
            <button
              onClick={() => setEmailOpen(true)}
              style={{ fontFamily: SANS, fontSize: 12, color: TEAL, background: 'white', border: `1px solid ${TEAL}30`, borderRadius: 10, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 5l8 6 8-6"/><rect x="2" y="4" width="16" height="13" rx="2"/></svg>
              Auto-fill from email thread
            </button>
          ) : (
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', background: CREAM, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: `${INK}50` }}>Auto-fill from email</span>
                <button onClick={() => { setEmailOpen(false); setEmailResult(null); setEmailError(null) }} style={{ fontFamily: SANS, background: 'none', border: 'none', fontSize: 16, color: `${INK}40`, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
              <div style={{ padding: 14 }}>
                {!emailResult ? (
                  <>
                    <p style={{ fontFamily: SANS, fontSize: 12, color: `${INK}60`, marginBottom: 10 }}>
                      Search your Gmail for the client thread. Enter a name or email address.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={emailQuery}
                        onChange={e => setEmailQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleEmailExtract()}
                        placeholder="e.g. Marc Perussich or marc@example.com"
                        autoFocus
                        style={{ flex: 1, fontFamily: SANS, fontSize: 12, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 10px', height: 34, color: INK, outline: 'none' }}
                      />
                      <button
                        onClick={handleEmailExtract}
                        disabled={emailLoading || !emailQuery.trim()}
                        style={{ fontFamily: SANS, height: 34, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: emailQuery.trim() && !emailLoading ? TEAL : CREAM, color: emailQuery.trim() && !emailLoading ? 'white' : `${INK}40`, border: 'none', cursor: emailQuery.trim() && !emailLoading ? 'pointer' : 'default', flexShrink: 0 }}>
                        {emailLoading ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {emailError && (
                      <p style={{ fontFamily: SANS, fontSize: 12, color: '#dc2626', marginTop: 8 }}>
                        {emailError === 'no_token' ? 'No Gmail access — sign out and back in to grant permission.' : emailError}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ fontFamily: SANS, fontSize: 12, color: `${INK}60`, marginBottom: 10 }}>
                      Found: <strong style={{ color: INK }}>{emailResult.threadSubject}</strong>
                    </p>
                    <div style={{ background: CREAM, borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 12 }}>
                      {([
                        ['Client',            emailResult.clientName],
                        ['Address',           emailResult.address],
                        ['Construction cost', emailResult.constructionCost ? `£${Number(emailResult.constructionCost).toLocaleString()}` : null],
                        ['Fee %',             emailResult.feePercent != null ? `${emailResult.feePercent}%` : null],
                        ['Stages',            Array.isArray(emailResult.selectedStages) ? emailResult.selectedStages.map((s: number) => `${s}`).join(', ') : null],
                        ['Date',              emailResult.date],
                      ] as [string, string | null][]).filter(([, v]) => v).map(([label, value], i, arr) => (
                        <div key={label} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                          <span style={{ fontFamily: SANS, fontSize: 11, color: `${INK}45`, width: 110, flexShrink: 0 }}>{label}</span>
                          <span style={{ fontFamily: SANS, fontSize: 12, color: INK, fontWeight: 500 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => applyEmailResult(emailResult)}
                        style={{ flex: 1, fontFamily: SANS, height: 34, borderRadius: 8, fontSize: 12, fontWeight: 600, background: TEAL, color: 'white', border: 'none', cursor: 'pointer' }}>
                        Apply to form
                      </button>
                      <button
                        onClick={() => { setEmailResult(null); setEmailQuery('') }}
                        style={{ fontFamily: SANS, height: 34, padding: '0 12px', borderRadius: 8, fontSize: 12, background: CREAM, color: `${INK}60`, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                        Search again
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Project Details */}
        <Section title="Project Details">
          <div>
            <Label>Client name</Label>
            <input
              type="text"
              value={form.clientName}
              onChange={e => set('clientName', e.target.value)}
              placeholder="e.g. Smith Family"
              className="w-full h-10 px-3 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Address</Label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="e.g. 12 Oak Street, London"
              className="w-full h-10 px-3 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Date</Label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Introduction quote</Label>
            <textarea
              value={form.introQuote}
              onChange={e => set('introQuote', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ ...inputStyle, height: 'auto', resize: 'vertical' }}
            />
          </div>
        </Section>

        {/* Fee */}
        <Section title="Fee">
          <div>
            <Label>Construction cost (£)</Label>
            <input
              type="number"
              value={form.constructionCost || ''}
              onChange={e => set('constructionCost', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 200000"
              min="0"
              className="w-full h-10 px-3 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Fee percentage (%)</Label>
            <input
              type="number"
              value={form.feePercent || ''}
              onChange={e => set('feePercent', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 15"
              min="0"
              max="100"
              step="0.01"
              className="w-full h-10 px-3 rounded-xl text-sm"
              style={inputStyle}
            />
          </div>
          {totalFee > 0 && (
            <div style={{ fontFamily: SANS, fontSize: 12, color: TEAL_DARK }}>
              Total fee: <strong>{gbp(totalFee)}</strong>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="interior"
              checked={form.includeInterior}
              onChange={e => set('includeInterior', e.target.checked)}
              style={{ accentColor: TEAL, width: 14, height: 14 }}
            />
            <label htmlFor="interior" style={{ fontFamily: SANS, fontSize: 12, color: INK, cursor: 'pointer' }}>
              Include Interior Design
            </label>
          </div>
          {form.includeInterior && (
            <div>
              <Label>Interior design fee (£)</Label>
              <input
                type="number"
                value={form.interiorFee || ''}
                onChange={e => set('interiorFee', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 2000"
                min="0"
                className="w-full h-10 px-3 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="landscape"
              checked={form.includeLandscape}
              onChange={e => set('includeLandscape', e.target.checked)}
              style={{ accentColor: TEAL, width: 14, height: 14 }}
            />
            <label htmlFor="landscape" style={{ fontFamily: SANS, fontSize: 12, color: INK, cursor: 'pointer' }}>
              Include Landscape Design
            </label>
          </div>
          {form.includeLandscape && (
            <div>
              <Label>Landscape design fee (£)</Label>
              <input
                type="number"
                value={form.landscapeFee || ''}
                onChange={e => set('landscapeFee', parseFloat(e.target.value) || 0)}
                placeholder="e.g. 1250"
                min="0"
                className="w-full h-10 px-3 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
          )}
        </Section>

        {/* Stages */}
        <Section title="Stages">
          {STAGE_NAMES.slice(1).map((name, idx) => { const i = idx + 1; return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id={`stage-${i}`}
                  checked={form.selectedStages[i]}
                  onChange={e => {
                    const next = [...form.selectedStages]
                    next[i] = e.target.checked
                    set('selectedStages', next)
                  }}
                  style={{ accentColor: TEAL, width: 14, height: 14, flexShrink: 0 }}
                />
                <label htmlFor={`stage-${i}`} style={{ fontFamily: SANS, fontSize: 12, color: INK, cursor: 'pointer', flex: 1 }}>
                  Stage {i}: {name}
                  {i === 0 && <span style={{ color: `${INK}40`, marginLeft: 6, fontSize: 11 }}>(Complimentary)</span>}
                  {i === 5 && <span style={{ color: `${INK}40`, marginLeft: 6, fontSize: 11 }}>(NIC)</span>}
                </label>
              </div>
              {form.selectedStages[i] && (
                <div style={{ marginLeft: 22, marginTop: 6, marginBottom: 2, padding: '10px 12px', background: CREAM, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {i >= 1 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Label>% of fee</Label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            value={form.stagePercentages[i]}
                            onChange={e => {
                              const next = [...form.stagePercentages]
                              next[i] = parseFloat(e.target.value) || 0
                              set('stagePercentages', next)
                            }}
                            min="0" max="100" step="0.01"
                            style={{ ...inputStyle, flex: 1, height: 32, padding: '0 6px', borderRadius: 8, fontFamily: SANS, fontSize: 11, textAlign: 'right' as const }}
                          />
                          <span style={{ fontFamily: SANS, fontSize: 11, color: `${INK}50`, flexShrink: 0 }}>%</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <Label>Stage fee (£)</Label>
                        <input
                          type="number"
                          value={(form.stageFeeOverrides?.[i] ?? 0) > 0 ? form.stageFeeOverrides![i]! : ''}
                          onChange={e => {
                            const next = [...(form.stageFeeOverrides ?? [null, null, null, null, null, null])]
                            next[i] = parseFloat(e.target.value) || null
                            set('stageFeeOverrides', next)
                          }}
                          placeholder={stageFees[i] > 0 ? String(Math.round(stageFees[i])) : 'Auto'}
                          min="0"
                          style={{ ...inputStyle, height: 32, padding: '0 8px', borderRadius: 8, fontFamily: SANS, fontSize: 11, width: '100%' }}
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Client meetings</Label>
                    <input
                      type="number"
                      value={form.meetingsPerStage[i] || ''}
                      onChange={e => {
                        const next = [...form.meetingsPerStage]
                        next[i] = parseInt(e.target.value) || 0
                        set('meetingsPerStage', next)
                      }}
                      min="0" max="20"
                      placeholder="0"
                      style={{ ...inputStyle, height: 32, padding: '0 8px', borderRadius: 8, fontFamily: SANS, fontSize: 11, width: '100%' }}
                    />
                  </div>
                  {/* Stage 2 optional extras */}
                  {i === 2 && (() => {
                    const opts = [{ key: 'artisticRender' as const, label: 'Artistic Render' }]
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
                        <span style={{ fontFamily: SANS, fontSize: 10, color: `${INK}50`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Optional extras</span>
                        {opts.map(opt => {
                          const val = (form.stageOptionals ?? {})[opt.key] || 0
                          return (
                            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="checkbox" checked={val > 0} onChange={e => set('stageOptionals', { ...(form.stageOptionals ?? { artisticRender: 0, physicalModel: 0, cdm: 0, tender: 0, partyWall: 0, specification: 0 }), [opt.key]: e.target.checked ? OPTIONAL_PRICES[1] : 0 })} style={{ accentColor: TEAL, width: 13, height: 13, flexShrink: 0 }} />
                              <span style={{ fontFamily: SANS, fontSize: 11, color: INK, flex: 1 }}>{opt.label}</span>
                              {val > 0 && (
                                <input
                                  type="number"
                                  value={val || ''}
                                  onChange={e => set('stageOptionals', { ...(form.stageOptionals ?? { artisticRender: 0, physicalModel: 0, cdm: 0, tender: 0, partyWall: 0, specification: 0 }), [opt.key]: parseFloat(e.target.value) || 0 })}
                                  min="0" placeholder="0"
                                  style={{ ...inputStyle, height: 28, padding: '0 6px', borderRadius: 8, fontFamily: SANS, fontSize: 11, width: 90 }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {/* Stage 3 optional extras */}
                  {i === 3 && (() => {
                    const opts: { key: keyof typeof form.stageOptionals; label: string }[] = [
                      { key: 'physicalModel', label: 'Physical Model' },
                      { key: 'cdm',           label: 'CDM (Principal Designer)' },
                    ]
                    const base = form.stageOptionals ?? { artisticRender: 0, physicalModel: 0, cdm: 0, tender: 0, partyWall: 0, specification: 0 }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
                        <span style={{ fontFamily: SANS, fontSize: 10, color: `${INK}50`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Optional extras</span>
                        {opts.map(opt => {
                          const val = base[opt.key] || 0
                          return (
                            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="checkbox" checked={val > 0} onChange={e => set('stageOptionals', { ...base, [opt.key]: e.target.checked ? OPTIONAL_PRICES[1] : 0 })} style={{ accentColor: TEAL, width: 13, height: 13, flexShrink: 0 }} />
                              <span style={{ fontFamily: SANS, fontSize: 11, color: INK, flex: 1 }}>{opt.label}</span>
                              {val > 0 && (
                                <input
                                  type="number"
                                  value={val || ''}
                                  onChange={e => set('stageOptionals', { ...base, [opt.key]: parseFloat(e.target.value) || 0 })}
                                  min="0" placeholder="0"
                                  style={{ ...inputStyle, height: 28, padding: '0 6px', borderRadius: 8, fontFamily: SANS, fontSize: 11, width: 90 }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {/* Stage 4 optional extras */}
                  {i === 4 && (() => {
                    const opts: { key: keyof typeof form.stageOptionals; label: string }[] = [
                      { key: 'tender',        label: 'Tender' },
                      { key: 'partyWall',     label: 'Party Wall' },
                      { key: 'specification', label: 'Specification' },
                    ]
                    const base = form.stageOptionals ?? { artisticRender: 0, physicalModel: 0, cdm: 0, tender: 0, partyWall: 0, specification: 0 }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
                        <span style={{ fontFamily: SANS, fontSize: 10, color: `${INK}50`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Optional extras</span>
                        {opts.map(opt => {
                          const val = base[opt.key] || 0
                          return (
                            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="checkbox" checked={val > 0} onChange={e => set('stageOptionals', { ...base, [opt.key]: e.target.checked ? 500 : 0 })} style={{ accentColor: TEAL, width: 13, height: 13, flexShrink: 0 }} />
                              <span style={{ fontFamily: SANS, fontSize: 11, color: INK, flex: 1 }}>{opt.label}</span>
                              {val > 0 && (
                                <input
                                  type="number"
                                  value={val || ''}
                                  onChange={e => set('stageOptionals', { ...base, [opt.key]: parseFloat(e.target.value) || 0 })}
                                  min="0" placeholder="0"
                                  style={{ ...inputStyle, height: 28, padding: '0 6px', borderRadius: 8, fontFamily: SANS, fontSize: 11, width: 90 }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )})}
        </Section>

        {/* Timeline */}
        {hasTimeline && (
          <Section title="Timeline">
            <div>
              <Label>Start month</Label>
              <input
                type="month"
                value={form.startMonth}
                onChange={e => set('startMonth', e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Total weeks</Label>
              <input
                type="number"
                value={form.totalWeeks || ''}
                onChange={e => set('totalWeeks', parseInt(e.target.value) || 0)}
                min="1"
                className="w-full h-10 px-3 rounded-xl text-sm"
                style={inputStyle}
              />
            </div>
          </Section>
        )}

      </div>

      {/* ── Right panel: PDF preview ── */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 24, background: '#e8e5de', display: isMobile && !showMobilePreview ? 'none' : 'flex', flexDirection: 'column' }}>
        {isMobile && showMobilePreview && (
          <button onClick={() => setShowMobilePreview(false)} style={{ fontFamily: SANS, fontSize: 12, color: `${INK}60`, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', marginBottom: 12, alignSelf: 'flex-start' }}>
            ← Back to form
          </button>
        )}
        <PDFPreview form={form} />
      </div>
    </div>
  )
}

// ── PDF preview (live iframe backed by InDesign template) ──────────────────────
function PDFPreview({ form }: { form: ProposalForm }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const prevUrlRef = useRef<string | null>(null)
  const isFirstRef = useRef(true)

  useEffect(() => {
    const delay = isFirstRef.current ? 300 : 1500
    isFirstRef.current = false

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/proposals/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = url
        setPdfUrl(url)
      } catch {
        // Keep showing last preview on error
      } finally {
        setLoading(false)
      }
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  useEffect(() => {
    return () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current) }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 20 }}>
        {loading && (
          <span style={{ fontFamily: SANS, fontSize: 11, color: '#888' }}>Updating preview…</span>
        )}
      </div>
      {pdfUrl ? (
        <iframe
          src={`${pdfUrl}#toolbar=0`}
          style={{ flex: 1, width: '100%', border: 'none', borderRadius: 8, boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}
          title="Proposal preview"
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRadius: 8, color: '#aaa', fontFamily: SANS, fontSize: 12 }}>
          {loading ? 'Generating preview…' : 'Fill in the form to see a preview'}
        </div>
      )}
    </div>
  )
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>}>
      <ProposalBuilder />
    </Suspense>
  )
}
