import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-helpers'
import { format } from 'date-fns'

const client = new Anthropic({ timeout: 55_000, maxRetries: 1 })

interface ProjectContext {
  id: string
  name: string
  code?: string
  status: string
  stagesCompleted: number
  stagesTotal: number
  stages: Array<{ id: string; name: string }>
}

function buildSystemPrompt(context: {
  userName: string
  activeProjects: ProjectContext[]
  recentEntries: Array<{ project: string; stage: string; hours: number; date: string }>
  teamMembers?: Array<{ id: string; name: string }>
}, memberId: string): string {
  const { userName, activeProjects, recentEntries, teamMembers = [] } = context
  const today = format(new Date(), 'yyyy-MM-dd')

  const projectLines = activeProjects.length > 0
    ? activeProjects.map(p => {
        const progress = p.stagesTotal > 0 ? `${p.stagesCompleted}/${p.stagesTotal} stages` : 'no stages'
        const code = p.code ? ` (${p.code})` : ''
        const stageList = p.stages.length > 0
          ? `\n    Stages: ${p.stages.map(s => `${s.name} [id:${s.id}]`).join(', ')}`
          : ''
        return `  • ${p.name}${code} [id:${p.id}] — ${p.status}, ${progress}${stageList}`
      }).join('\n')
    : '  (none)'

  const entryLines = recentEntries.length > 0
    ? recentEntries.map(e => `  • ${e.date}: ${e.hours}h on ${e.project} / ${e.stage}`).join('\n')
    : '  (none)'

  const memberLines = teamMembers.length > 0
    ? teamMembers.map(m => `  • ${m.name} [id:${m.id}]`).join('\n')
    : '  (none)'

  return `You are a helpful studio assistant for ${process.env.NEXT_PUBLIC_FIRM_NAME || 'the studio'}, an architectural practice. You are chatting with ${userName} (member id: ${memberId}).

Today's date: ${today}

Active projects (with IDs for tool use):
${projectLines}

Team members (with IDs for tool use):
${memberLines}

${userName}'s recent time entries:
${entryLines}

Help with questions about projects, time tracking, workload, priorities, or anything else the user needs. Be concise and practical. Do not use markdown formatting — no bold, no italics, no bullet asterisks, no headers. Plain text only.

When the user asks to add or create a task, use create_task. Keep the title short (the action phrase only) and put any extra detail, context, or description the user provides into the notes field.
When the user asks to assign, reassign, update, or change a task (status, assignee, notes), use update_task.
When the user asks to log time or add hours, use log_time — use today's date unless they specify otherwise.
When asked about hours on a project, use query_hours.
When asked about budget, fees, or profitability, use get_project_budget.
When asked about team workload or what the team has been working on, use get_team_workload.
Use project, stage, and team member IDs from the context above. Match all names case-insensitively.
If anything is ambiguous, make your best guess and act on it rather than asking. Only ask a question if you genuinely cannot proceed — and if so, ask just one short question (e.g. "Stage 2 or 3?"). Never ask more than one question at a time.`
}

const tools: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description: 'Create a new task on a project kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'UUID of the project' },
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Optional notes' },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'done'], description: 'Defaults to not_started' },
        stage_id: { type: 'string', description: 'Optional stage UUID' },
      },
      required: ['project_id', 'title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task — assign it to a team member, change its status, or update its notes. Find the task by title within a project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'UUID of the project the task belongs to' },
        task_title: { type: 'string', description: 'Title of the task to update (case-insensitive match)' },
        assignee_id: { type: 'string', description: 'UUID of the team member to assign — use team member IDs from context' },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'done'], description: 'New status for the task' },
        notes: { type: 'string', description: 'Updated notes for the task' },
      },
      required: ['project_id', 'task_title'],
    },
  },
  {
    name: 'log_time',
    description: 'Log hours for the current user on a project and stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'UUID of the project' },
        stage_id: { type: 'string', description: 'UUID of the stage' },
        hours: { type: 'number', description: 'Number of hours to log' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['project_id', 'stage_id', 'hours'],
    },
  },
  {
    name: 'query_hours',
    description: 'Query total hours logged on a project, optionally filtered by stage or date range. Use this to answer questions like "how many hours on X this month?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'UUID of the project to query' },
        stage_id: { type: 'string', description: 'Optional: filter to a specific stage' },
        from_date: { type: 'string', description: 'Optional start date YYYY-MM-DD' },
        to_date: { type: 'string', description: 'Optional end date YYYY-MM-DD' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_project_budget',
    description: 'Get stage fees (budget) vs hours logged (actual cost) for a project. Use this for budget, profitability, or "are we over budget" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'UUID of the project' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_team_workload',
    description: 'Get hours logged per team member across projects for a date range. Use this for "what has the team been working on" or "who has the most hours" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to_date: { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: ['from_date', 'to_date'],
    },
  },
]

async function executeCreateTask(input: {
  project_id: string
  title: string
  notes?: string
  status?: string
  stage_id?: string
}): Promise<string> {
  const db = supabaseAdmin()
  const status = input.status ?? 'not_started'
  const { data: existing } = await db.from('tasks').select('position')
    .eq('project_id', input.project_id).eq('status', status)
    .order('position', { ascending: false }).limit(1)
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0
  const { data, error } = await db.from('tasks')
    .insert({ project_id: input.project_id, title: input.title, notes: input.notes ?? '', status, stage_id: input.stage_id ?? null, position })
    .select('id, title').single()
  if (error) return `Error creating task: ${error.message}`
  return `Task created: "${data.title}"`
}

async function executeUpdateTask(input: {
  project_id: string
  task_title: string
  assignee_id?: string
  status?: string
  notes?: string
}): Promise<string> {
  const db = supabaseAdmin()
  const { data: tasks, error: findError } = await db
    .from('tasks')
    .select('id, title')
    .eq('project_id', input.project_id)
    .ilike('title', `%${input.task_title}%`)
    .limit(1)
  if (findError) return `Error finding task: ${findError.message}`
  if (!tasks || tasks.length === 0) return `No task found matching "${input.task_title}" in that project.`
  const task = tasks[0]
  const updates: Record<string, any> = {}
  if (input.assignee_id !== undefined) updates.assignee_id = input.assignee_id
  if (input.status !== undefined) updates.status = input.status
  if (input.notes !== undefined) updates.notes = input.notes
  if (Object.keys(updates).length === 0) return 'No changes specified.'
  const { error } = await db.from('tasks').update(updates).eq('id', task.id)
  if (error) return `Error updating task: ${error.message}`
  return `Updated task "${task.title}" successfully.`
}

async function executeLogTime(input: {
  project_id: string
  stage_id: string
  hours: number
  date?: string
  notes?: string
}, memberId: string): Promise<string> {
  const db = supabaseAdmin()
  const date = input.date ?? format(new Date(), 'yyyy-MM-dd')
  const { data: existing } = await db.from('time_entries').select('id')
    .eq('member_id', memberId).eq('project_id', input.project_id)
    .eq('stage_id', input.stage_id).eq('date', date).maybeSingle()
  let error
  if (existing) {
    ;({ error } = await db.from('time_entries').update({ hours: input.hours, notes: input.notes ?? '' }).eq('id', existing.id))
  } else {
    ;({ error } = await db.from('time_entries').insert({ member_id: memberId, project_id: input.project_id, stage_id: input.stage_id, hours: input.hours, date, notes: input.notes ?? '' }))
  }
  if (error) return `Error logging time: ${error.message}`
  return `Logged ${input.hours}h on ${date}`
}

async function executeQueryHours(input: {
  project_id: string
  stage_id?: string
  from_date?: string
  to_date?: string
}): Promise<string> {
  const db = supabaseAdmin()
  let data: any[]
  try {
    data = await fetchAllRows(() => {
      let q = db.from('time_entries')
        .select('hours, date, member:team_members(name), stage:stages(name)')
        .eq('project_id', input.project_id)
      if (input.stage_id) q = q.eq('stage_id', input.stage_id)
      if (input.from_date) q = q.gte('date', input.from_date)
      if (input.to_date) q = q.lte('date', input.to_date)
      return q
    })
  } catch (err: any) {
    return `Error: ${err?.message ?? 'Database error'}`
  }
  if (!data || data.length === 0) return 'No hours logged for that query.'
  const total = data.reduce((s, e) => s + e.hours, 0)
  const byMember: Record<string, number> = {}
  const byStage: Record<string, number> = {}
  for (const e of data) {
    const name = (e.member as any)?.name ?? 'Unknown'
    const stage = (e.stage as any)?.name ?? 'Unknown'
    byMember[name] = (byMember[name] ?? 0) + e.hours
    byStage[stage] = (byStage[stage] ?? 0) + e.hours
  }
  const memberLines = Object.entries(byMember).sort((a, b) => b[1] - a[1]).map(([n, h]) => `${n}: ${h}h`).join(', ')
  const stageLines = Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([n, h]) => `${n}: ${h}h`).join(', ')
  return `Total: ${total}h\nBy member: ${memberLines}\nBy stage: ${stageLines}`
}

async function executeGetProjectBudget(input: { project_id: string }): Promise<string> {
  const db = supabaseAdmin()
  const [stagesResult, entriesResult, membersResult] = await Promise.allSettled([
    db.from('stages').select('id, name, fee, billable, completed').eq('project_id', input.project_id).order('position'),
    fetchAllRows(() => db.from('time_entries').select('stage_id, hours, member_id').eq('project_id', input.project_id)),
    db.from('project_members').select('member_id, hourly_rate').eq('project_id', input.project_id),
  ])
  const stages = stagesResult.status === 'fulfilled' ? (stagesResult.value as any).data : null
  const entries = entriesResult.status === 'fulfilled' ? entriesResult.value as any[] : []
  const members = membersResult.status === 'fulfilled' ? (membersResult.value as any).data : null
  if (!stages || stages.length === 0) return 'No stages found for this project.'
  const rateMap: Record<string, number> = {}
  for (const m of members ?? []) rateMap[m.member_id] = m.hourly_rate ?? 0
  const hoursByStage: Record<string, number> = {}
  let totalCost = 0
  for (const e of entries ?? []) {
    hoursByStage[e.stage_id] = (hoursByStage[e.stage_id] ?? 0) + e.hours
    totalCost += e.hours * (rateMap[e.member_id] ?? 0)
  }
  const totalFee = (stages as any[]).filter((s: any) => s.billable).reduce((acc: number, st: any) => acc + (st.fee ?? 0), 0)
  const lines = (stages as any[]).map((s: any) => {
    const logged = hoursByStage[s.id] ?? 0
    const fee = s.fee ?? 0
    return `${s.name}: £${fee} fee, ${logged}h logged${s.completed ? ' (done)' : ''}`
  })
  return `${lines.join('\n')}\n\nTotal fee: £${totalFee} | Total cost: £${Math.round(totalCost)} | Profit: £${Math.round(totalFee - totalCost)}`
}

async function executeGetTeamWorkload(input: { from_date: string; to_date: string }): Promise<string> {
  const db = supabaseAdmin()
  let data: any[]
  try {
    data = await fetchAllRows(() =>
      db.from('time_entries')
        .select('hours, member:team_members(name), project:projects(name)')
        .gte('date', input.from_date).lte('date', input.to_date)
    )
  } catch (err: any) {
    return `Error: ${err?.message ?? 'Database error'}`
  }
  if (!data || data.length === 0) return 'No hours logged in that period.'
  const byMember: Record<string, { total: number; projects: Record<string, number> }> = {}
  for (const e of data) {
    const name = (e.member as any)?.name ?? 'Unknown'
    const project = (e.project as any)?.name ?? 'Unknown'
    if (!byMember[name]) byMember[name] = { total: 0, projects: {} }
    byMember[name].total += e.hours
    byMember[name].projects[project] = (byMember[name].projects[project] ?? 0) + e.hours
  }
  return Object.entries(byMember)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => {
      const projects = Object.entries(data.projects).sort((a, b) => b[1] - a[1]).map(([p, h]) => `${p} ${h}h`).join(', ')
      return `${name}: ${data.total}h (${projects})`
    }).join('\n')
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { messages, context } = body
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  const memberId = session.user?.memberId ?? ''
  const systemPrompt = buildSystemPrompt(context ?? { userName: session.user?.name ?? 'there', activeProjects: [], recentEntries: [] }, memberId)
  const formattedMessages: Anthropic.MessageParam[] = messages.slice(-20).map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = formattedMessages

        for (let round = 0; round < 5; round++) {
          // Always stream — text reaches the client immediately, keeping the socket alive
          const anthropicStream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: systemPrompt,
            tools,
            messages: currentMessages,
          })

          // Collect content blocks while forwarding text to the client in real time
          const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> = []
          const toolInputBuffers: Record<number, string> = {}
          let stopReason: string | null = null

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_start') {
              const cb = event.content_block
              if (cb.type === 'text') {
                contentBlocks[event.index] = { type: 'text', text: '' }
              } else if (cb.type === 'tool_use') {
                contentBlocks[event.index] = { type: 'tool_use', id: cb.id, name: cb.name, input: {} }
                toolInputBuffers[event.index] = ''
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(event.delta.text))
                const b = contentBlocks[event.index]
                if (b?.type === 'text') b.text += event.delta.text
              } else if (event.delta.type === 'input_json_delta') {
                toolInputBuffers[event.index] = (toolInputBuffers[event.index] ?? '') + event.delta.partial_json
              }
            } else if (event.type === 'content_block_stop') {
              if (toolInputBuffers[event.index] !== undefined) {
                const b = contentBlocks[event.index]
                if (b?.type === 'tool_use') {
                  try { b.input = JSON.parse(toolInputBuffers[event.index] || '{}') } catch { b.input = {} }
                }
              }
            } else if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? null
            }
          }

          // No tool calls — text was already streamed, we're done
          if (stopReason !== 'tool_use') break

          // Execute all tool calls collected from this stream
          const toolUseBlocks = contentBlocks.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b?.type === 'tool_use')
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolUse of toolUseBlocks) {
            let result: string
            const inp = toolUse.input as Record<string, any>
            if (toolUse.name === 'create_task') {
              result = await executeCreateTask(inp as Parameters<typeof executeCreateTask>[0])
            } else if (toolUse.name === 'update_task') {
              result = await executeUpdateTask(inp as Parameters<typeof executeUpdateTask>[0])
            } else if (toolUse.name === 'log_time') {
              result = await executeLogTime(inp as Parameters<typeof executeLogTime>[0], memberId)
            } else if (toolUse.name === 'query_hours') {
              result = await executeQueryHours(inp as Parameters<typeof executeQueryHours>[0])
            } else if (toolUse.name === 'get_project_budget') {
              result = await executeGetProjectBudget(inp as Parameters<typeof executeGetProjectBudget>[0])
            } else if (toolUse.name === 'get_team_workload') {
              result = await executeGetTeamWorkload(inp as Parameters<typeof executeGetTeamWorkload>[0])
            } else {
              result = 'Unknown tool'
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
          }

          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: contentBlocks.filter(Boolean) },
            { role: 'user', content: toolResults },
          ]
          // Next round will stream Claude's response to the tool results
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        controller.enqueue(encoder.encode(`\n[Error: ${msg}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
