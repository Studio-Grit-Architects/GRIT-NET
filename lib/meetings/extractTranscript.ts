import mammoth from 'mammoth'

export async function extractTranscript(buffer: Buffer, ext: 'docx' | 'txt'): Promise<string> {
  let raw: string

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    raw = result.value
  } else {
    raw = buffer.toString('utf-8')
  }

  return stripMeetNoise(raw)
}

function stripMeetNoise(text: string): string {
  const lines = text.split('\n')

  const cleaned = lines.filter(line => {
    const t = line.trim()
    if (!t) return false

    // Google Meet section headers
    if (/^(participants|transcript|attendees|note:?)$/i.test(t)) return false

    // "John Smith  0:01:23" or "John Smith  10:32 AM" — two or more spaces before timestamp
    if (/^.+\s{2,}\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i.test(t)) return false

    // Standalone timestamp line "0:01:23" or "10:32 AM"
    if (/^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/.test(t)) return false

    return true
  })

  return cleaned.join('\n').replace(/\n{2,}/g, '\n\n').trim()
}
