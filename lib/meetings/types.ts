export interface Meeting {
  id: string
  title: string
  recipient_email: string | null
  file_name: string | null
  transcript: string | null
  summary: string | null
  email_subject: string | null
  email_body: string | null
  project_id: string | null
  project?: { id: string; name: string; color: string | null } | null
  status: 'pending' | 'processing' | 'done' | 'draft_created' | 'error'
  created_at: string
  action_items: string[] | null
}


export type ProcessingStep = 'idle' | 'uploading' | 'reading' | 'summarising' | 'done' | 'error'

export interface ProcessResult {
  id: string
  summary: string[]
  emailSubject: string
  emailBody: string
  transcript: string
  suggestedProjectId: string | null
  actionItems: string[]
}
