export interface Client {
  id: string
  name: string
  contact_name: string
  email: string
  phone: string
  address: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  client: string | { id: string; name: string } | null
  client_id: string | null
  code: string
  color: string
  archived: boolean
  status: string
  start_date: string | null
  end_date: string | null
  notes: string
  project_type: 'time_materials' | 'fixed_fee' | 'non_billable'
  created_at: string
}

export interface Stage {
  id: string
  project_id: string
  name: string
  position: number
  completed: boolean
  fee: number
  billable: boolean
  start_date?: string | null
  end_date?: string | null
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  notes: string
  status: string
  assignee_id: string | null
  assignee_ids: string[]
  stage_id: string | null
  position: number
  start_date: string | null
  due_date: string | null
  assignee?: { id: string; name: string }
  stage?: { id: string; name: string }
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  created_at: string
}

export interface TimeEntry {
  id: string
  member_id: string
  project_id: string
  stage_id: string
  hours: number
  notes: string | null
  date: string
  created_at: string
  project?: Project
  stage?: Stage
  member?: TeamMember
}

export interface WeeklyRow {
  project: Project
  stage: Stage
  entries: Record<string, TimeEntry | null>
}

export interface PlanningApplication {
  id: string
  project_id: string
  application_type: string
  reference_number: string | null
  submission_date: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  member_id: string
  hourly_rate: number
  created_at: string
  member?: TeamMember
}

export interface StageDeliverable {
  id: string
  stage_id: string
  title: string
  completed: boolean
  position: number
  created_at: string
}

export interface DeliverableTemplateItem {
  id: string
  template_id: string
  title: string
  position: number
  created_at: string
}

export interface DeliverableTemplate {
  id: string
  name: string
  riba_stage: string
  created_at: string
  items?: DeliverableTemplateItem[]
}

export function clientLabel(c: Project['client'] | undefined): string {
  if (!c) return ''
  if (typeof c === 'object') return c.name
  return c
}
