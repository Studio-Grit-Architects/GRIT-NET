import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTranscript } from '@/lib/meetings/extractTranscript'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const rawTranscript = (formData.get('transcriptText') as string) || null  // from recorder
  const title = (formData.get('title') as string) || 'Untitled Meeting'
  const recipientEmail = (formData.get('recipientEmail') as string) || null
  const manualProjectId = (formData.get('projectId') as string) || null

  let transcript: string

  if (rawTranscript) {
    // Recorder path — transcript already extracted by Groq Whisper
    transcript = rawTranscript.trim()
    if (!transcript) return NextResponse.json({ error: 'Empty transcript' }, { status: 400 })
  } else {
    // File upload path — extract from .docx or .txt
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'docx' && ext !== 'txt') {
      return NextResponse.json({ error: 'Only .docx and .txt files are supported' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      transcript = await extractTranscript(buffer, ext as 'docx' | 'txt')
    } catch {
      return NextResponse.json({ error: 'Failed to read transcript file' }, { status: 422 })
    }

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'No text could be extracted from this file' }, { status: 422 })
    }
  }

  // Fetch active projects so Claude can auto-suggest a match
  const db = supabaseAdmin()
  const { data: projects } = await db
    .from('projects')
    .select('id, name, code, color')
    .eq('archived', false)
    .neq('status', 'completed')
    .order('name')

  const projectList = (projects || [])
    .map((p: { id: string; name: string; code?: string }) => `- ${p.id}: ${p.name}${p.code ? ` (${p.code})` : ''}`)
    .join('\n')

  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 })
  let message
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are a professional meeting assistant. Respond only with valid JSON — no markdown, no explanation.',
      messages: [
        {
          role: 'user',
          content: `Analyse this Google Meet transcript for a meeting titled "${title}" and return a JSON object in exactly this format:
{
  "summary": ["bullet point 1", "bullet point 2"],
  "actionItems": ["Concise task title 1", "Concise task title 2"],
  "emailSubject": "subject line here",
  "emailBody": "email body here",
  "suggestedProjectId": "uuid or null"
}

Rules:
- summary: 4–8 concise bullet points covering key decisions, action items, and outcomes only
- actionItems: concrete tasks or follow-ups mentioned or implied in the meeting; 2–8 short action-oriented titles (e.g. "Review structural drawings", "Send updated fee proposal"); empty array if none found
- emailSubject: short, professional, references the meeting topic
- emailBody: 150–250 words, friendly but professional, recaps key points and next steps; do not include a sign-off line
- suggestedProjectId: pick the single most relevant project ID from the list below based on the meeting content, or null if nothing fits

Active projects:
${projectList || '(none)'}

Transcript:
${transcript}`,
        },
      ],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI request failed'
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 })
  }

  const block = message.content[0]
  if (!block || block.type !== 'text') return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 })
  const raw = block.text.trim()
  const jsonStr = raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw

  let parsed: { summary: string[]; actionItems?: string[]; emailSubject: string; emailBody: string; suggestedProjectId?: string | null }
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // Speaker identification: Haiku reformats the raw transcript with speaker labels
  // inferred from context (names mentioned, question/answer patterns, roles).
  // Best-effort — plain transcript used if this call fails or times out.
  let storedTranscript = transcript
  try {
    const haikuClient = new Anthropic({ timeout: 35_000, maxRetries: 0 })
    const speakerMsg = await haikuClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: 'You format meeting transcripts with speaker labels. Return only the formatted transcript — no preamble, no explanation.',
      messages: [{
        role: 'user',
        content: `Label each speaker in this meeting transcript. Use "**[Name]:**" if you can identify the speaker by name from the conversation, otherwise use "**Speaker A:**", "**Speaker B:**" etc. consistently. Put each speaker turn on its own paragraph with a blank line between turns. Do not alter the spoken words — only add or fix speaker labels.\n\nMeeting title: "${title}"\n\nTranscript:\n${transcript}`,
      }],
    })
    const speakerBlock = speakerMsg.content[0]
    if (speakerBlock?.type === 'text' && speakerBlock.text.trim()) {
      storedTranscript = speakerBlock.text.trim()
    }
  } catch {
    // speaker labelling is best-effort; plain transcript is an acceptable fallback
  }

  // Manual selection beats Claude's suggestion
  const resolvedProjectId = manualProjectId || parsed.suggestedProjectId || null

  // Validate the resolved project id is actually in our list
  const validIds = new Set((projects || []).map((p: { id: string }) => p.id))
  const projectId = resolvedProjectId && validIds.has(resolvedProjectId) ? resolvedProjectId : null

  const { data, error } = await db
    .from('meetings')
    .insert({
      title,
      recipient_email: recipientEmail,
      file_name: file?.name ?? 'recorded-meeting',
      transcript: storedTranscript,
      summary: Array.isArray(parsed.summary) ? parsed.summary.join('\n') : String(parsed.summary ?? ''),
      email_subject: parsed.emailSubject,
      email_body: parsed.emailBody,
      project_id: projectId,
      action_items: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      status: 'done',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: `Failed to save meeting: ${error.message}` }, { status: 500 })

  return NextResponse.json({
    id: data.id,
    summary: Array.isArray(parsed.summary) ? parsed.summary : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    emailSubject: parsed.emailSubject,
    emailBody: parsed.emailBody,
    transcript,
    suggestedProjectId: projectId,
  })
}
