import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, parseISO } from 'date-fns'

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatDisplay(date: Date): string {
  return format(date, 'd MMM')
}

export function formatDayName(date: Date): string {
  return format(date, 'EEE')
}

export function formatWeekRange(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  if (format(start, 'MMM yyyy') === format(end, 'MMM yyyy')) {
    return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`
  }
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

export function nextWeek(date: Date): Date {
  return addWeeks(date, 1)
}

export function prevWeek(date: Date): Date {
  return subWeeks(date, 1)
}

export function isToday(date: Date): boolean {
  return formatDate(date) === formatDate(new Date())
}

export function hoursToDisplay(h: number): string {
  if (!h) return ''
  const wh = Math.floor(h)
  let wm = Math.round((h - wh) * 60)
  // Carry overflow: 60 minutes → +1 hour
  const extraH = Math.floor(wm / 60)
  wm = wm % 60
  const totalH = wh + extraH
  if (wm === 0) return `${totalH}h`
  if (totalH === 0) return `${wm}m`
  return `${totalH}h ${wm}m`
}

export function parseHoursInput(val: string): number | null {
  const trimmed = val.trim()
  if (!trimmed) return 0
  // Accept "2", "2.5", "2h", "2h30m", "2:30", "90m"
  if (!trimmed.includes('h') && !trimmed.includes('m') && !trimmed.includes(':')) {
    const plainNum = parseFloat(trimmed)
    // Reject garbage like "2x" — must be a pure number with nothing else after digits/dot
    if (!isNaN(plainNum) && /^\d+(\.\d+)?$/.test(trimmed)) {
      if (plainNum < 0) return 0
      return plainNum
    }
    return null
  }
  // h:mm format
  const colonMatch = trimmed.match(/^(\d+):(\d{2})$/)
  if (colonMatch) {
    const result = parseInt(colonMatch[1]) + parseInt(colonMatch[2]) / 60
    return result < 0 ? 0 : result
  }
  // Xh Ym format
  const hmMatch = trimmed.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/)
  if (hmMatch && (hmMatch[1] || hmMatch[2])) {
    const result = (parseInt(hmMatch[1] || '0')) + (parseInt(hmMatch[2] || '0')) / 60
    return result < 0 ? 0 : result
  }
  return null
}
