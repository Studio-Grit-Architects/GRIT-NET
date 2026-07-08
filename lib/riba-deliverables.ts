export interface RibaDeliverable {
  title: string
}

export const RIBA_DELIVERABLES: Record<number, RibaDeliverable[]> = {
  1: [
    { title: 'Site Appraisal' },
    { title: 'Site Report' },
    { title: 'Programme' },
    { title: 'Cost' },
    { title: 'Project Brief' },
    { title: 'Procurement' },
    { title: 'Consultant Engagement' },
    { title: 'Sustainability' },
    { title: 'Brief Document' },
  ],
  2: [
    { title: 'Site Appraisal' },
    { title: 'Architectural Concept' },
    { title: 'Design Reviews' },
    { title: 'Town Planning Services' },
    { title: 'Cost Plan' },
    { title: 'Sustainability' },
    { title: 'Concept Design Package' },
  ],
  3: [
    { title: 'Consultant Coordination' },
    { title: 'Programme' },
    { title: 'Cost Plan' },
    { title: 'Principal Designer' },
    { title: 'Outline Specification' },
    { title: 'Sustainability' },
    { title: 'Building Control' },
    { title: 'Tender' },
  ],
  4: [
    { title: 'Consultant Coordination' },
    { title: 'Town Planning Services' },
    { title: 'Programme' },
    { title: 'Cost Plan' },
    { title: 'Construction Information' },
    { title: 'Building Control' },
    { title: 'Building Regulations' },
    { title: 'Principal Designer' },
  ],
  5: [
    { title: 'Construction Administration' },
    { title: 'Consultant Coordination' },
    { title: 'Programme' },
    { title: 'Site Inspections' },
    { title: 'Site Queries' },
    { title: 'Principal Designer' },
    { title: 'Operations and Maintenance Manuals' },
    { title: 'Statutory Consents' },
    { title: 'Manufacturer\'s Maintenance Instructions' },
    { title: 'Town Planning Services' },
  ],
}

interface StageOptionals {
  artisticRender: number
  physicalModel: number
  cdm: number
  tender: number
  partyWall: number
  specification: number
}

export function getOptionalDeliverables(stageIdx: number, optionals: StageOptionals): RibaDeliverable[] {
  const result: RibaDeliverable[] = []
  if (stageIdx === 2 && (optionals.artisticRender ?? 0) > 0) {
    result.push({ title: 'Artistic Render' })
  }
  if (stageIdx === 3 && (optionals.physicalModel ?? 0) > 0) {
    result.push({ title: 'Physical Model' })
  }
  if (stageIdx === 3 && (optionals.cdm ?? 0) > 0) {
    result.push({ title: 'CDM (Principal Designer)' })
  }
  if (stageIdx === 4 && (optionals.tender ?? 0) > 0) {
    result.push({ title: 'Tender' })
  }
  if (stageIdx === 4 && (optionals.partyWall ?? 0) > 0) {
    result.push({ title: 'Party Wall Award' })
  }
  if (stageIdx === 4 && (optionals.specification ?? 0) > 0) {
    result.push({ title: 'Specification' })
  }
  return result
}
