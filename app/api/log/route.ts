import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { format } from 'date-fns'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.memberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, date } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: projects } = await db
    .from('projects')
    .select('id, name, code')
    .eq('archived', false)
    .neq('status', 'completed')
    .order('name')

  const projectList = (projects ?? [])
    .map((p: { id: string; name: string; code?: string }) =>
      `- ${p.id}: ${p.name}${p.code ? ` (${p.code})` : ''}`)
    .join('\n')

  type ParsedEntry = { project_id: string | null; hours: number; notes: string | null }
  let entries: ParsedEntry[] = []

  try {
    const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })
    const ai = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'You are a time entry parser for an architecture firm. Respond only with valid JSON — no markdown, no explanation.',
      messages: [{
        role: 'user',
        content:
          `Parse this message into time entries. Match project names flexibly.\n\n` +
          `Active projects:\n${projectList || '(none)'}\n\n` +
          `Message: "${message}"\n\n` +
          `Return a JSON array:\n` +
          `[{"project_id": "uuid or null", "hours": 2.5, "notes": "optional or null"}]\n\n` +
          `Rules:\n` +
          `- Hours: "3hrs", "3h", "half day" (=4), "full day" (=8)\n` +
          `- Match project names loosely — "Smith house" can match "Smith Residence"\n` +
          `- No match → project_id: null, put the text in notes\n` +
          `- Always return an array, even if empty`,
      }],
    })

    if (!ai.content?.[0] || ai.content[0].type !== 'text') {
      throw new Error('Unexpected AI response format')
    }
    const raw = (ai.content[0] as { type: 'text'; text: string }).text.trim()
    const jsonStr = raw.startsWith('```')
      ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      : raw
    entries = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Could not parse your message — please try again.' }, { status: 422 })
  }

  const entryDate = date ?? format(new Date(), 'yyyy-MM-dd')
  const validEntries = entries.filter(e => e.project_id && e.hours > 0 && e.hours <= 24)
  const unmatched   = entries.filter(e => !e.project_id && e.hours > 0 && e.hours <= 24)

  if (validEntries.length > 0) {
    const projectIds = Array.from(new Set(validEntries.map(e => e.project_id!)))
    const { data: stages } = await db
      .from('stages')
      .select('id, project_id, position')
      .in('project_id', projectIds)
      .order('position', { ascending: true })

    const firstStage: Record<string, string> = {}
    for (const s of stages ?? []) {
      if (!firstStage[s.project_id]) firstStage[s.project_id] = s.id
    }

    const insertable = validEntries.filter(e => firstStage[e.project_id!])
    if (insertable.length > 0) {
      const { error: insertError } = await db.from('time_entries').upsert(
        insertable.map(e => ({
          member_id:  session.user.memberId,
          project_id: e.project_id,
          stage_id:   firstStage[e.project_id!],
          hours:      e.hours,
          notes:      e.notes ?? null,
          date:       entryDate,
        })),
        { onConflict: 'member_id,project_id,stage_id,date' }
      )
      if (insertError) return NextResponse.json({ error: 'Database error' }, { status: 500 })
      return NextResponse.json({ logged: insertable.length, unmatched: unmatched.length })
    }
  }

  return NextResponse.json({ logged: 0, unmatched: unmatched.length })
}
