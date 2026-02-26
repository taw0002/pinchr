interface HumanizeCronOptions {
  timezone?: string | null
}

type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

type ParsedSegmentKind = 'wildcard' | 'value' | 'range'

interface ParsedSegment {
  kind: ParsedSegmentKind
  start?: number
  end?: number
  step?: number
}

interface ParsedField {
  raw: string
  segments: ParsedSegment[]
}

interface ParsedCron {
  expression: string
  timezone?: string
  minute: ParsedField
  hour: ParsedField
  dayOfMonth: ParsedField
  month: ParsedField
  dayOfWeek: ParsedField
}

interface FieldDefinition {
  min: number
  max: number
  label: string
  plural: string
  names?: Record<string, number>
  formatValue?: (value: number) => string
}

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MONTH_NAME_MAP: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12
}

const DAY_NAME_MAP: Record<string, number> = {
  SUN: 0,
  SUNDAY: 0,
  MON: 1,
  MONDAY: 1,
  TUE: 2,
  TUES: 2,
  TUESDAY: 2,
  WED: 3,
  WEDNESDAY: 3,
  THU: 4,
  THUR: 4,
  THURS: 4,
  THURSDAY: 4,
  FRI: 5,
  FRIDAY: 5,
  SAT: 6,
  SATURDAY: 6
}

const FIELD_DEFINITIONS: Record<CronFieldName, FieldDefinition> = {
  minute: {
    min: 0,
    max: 59,
    label: 'minute',
    plural: 'minutes',
    formatValue: (value) => value.toString().padStart(2, '0')
  },
  hour: {
    min: 0,
    max: 23,
    label: 'hour',
    plural: 'hours',
    formatValue: (value) => value.toString().padStart(2, '0')
  },
  dayOfMonth: {
    min: 1,
    max: 31,
    label: 'day',
    plural: 'days'
  },
  month: {
    min: 1,
    max: 12,
    label: 'month',
    plural: 'months',
    names: MONTH_NAME_MAP,
    formatValue: (value) => MONTH_NAMES[value] ?? String(value)
  },
  dayOfWeek: {
    min: 0,
    max: 6,
    label: 'weekday',
    plural: 'weekdays',
    names: DAY_NAME_MAP,
    formatValue: (value) => DAY_NAMES[value] ?? String(value)
  }
}

const SPECIAL_EXPRESSIONS: Record<string, string> = {
  '@YEARLY': '0 0 1 1 *',
  '@ANNUALLY': '0 0 1 1 *',
  '@MONTHLY': '0 0 1 * *',
  '@WEEKLY': '0 0 * * 0',
  '@DAILY': '0 0 * * *',
  '@MIDNIGHT': '0 0 * * *',
  '@HOURLY': '0 * * * *'
}

function normalizeExpression(expression: string): string {
  const trimmed = expression.trim()
  if (!trimmed) return ''

  const keyword = trimmed.toUpperCase()
  if (SPECIAL_EXPRESSIONS[keyword]) {
    return SPECIAL_EXPRESSIONS[keyword]
  }

  return trimmed.replace(/\s+/g, ' ')
}

function parseNumericToken(rawToken: string, field: CronFieldName): number | null {
  const token = rawToken.trim().toUpperCase()
  const definition = FIELD_DEFINITIONS[field]

  let parsed: number | undefined

  if (definition.names && token in definition.names) {
    parsed = definition.names[token]
  } else if (/^\d+$/.test(token)) {
    parsed = Number(token)
  } else {
    return null
  }

  if (field === 'dayOfWeek' && parsed === 7) {
    parsed = 0
  }

  if (parsed < definition.min || parsed > definition.max) {
    return null
  }

  return parsed
}

function parseSegment(rawSegment: string, field: CronFieldName): ParsedSegment | null {
  const segment = rawSegment.trim()
  if (!segment) return null

  const [basePartRaw, stepPartRaw] = segment.split('/')
  if (segment.split('/').length > 2) return null

  const basePart = basePartRaw.trim()
  let step: number | undefined
  if (stepPartRaw !== undefined) {
    const parsedStep = Number(stepPartRaw.trim())
    if (!Number.isInteger(parsedStep) || parsedStep <= 0) {
      return null
    }
    step = parsedStep
  }

  if (basePart === '*' || basePart === '?') {
    return {
      kind: 'wildcard',
      step
    }
  }

  if (basePart.includes('-')) {
    const [startRaw, endRaw] = basePart.split('-')
    if (basePart.split('-').length !== 2) return null

    const start = parseNumericToken(startRaw, field)
    const end = parseNumericToken(endRaw, field)
    if (start === null || end === null || start > end) return null

    return {
      kind: 'range',
      start,
      end,
      step
    }
  }

  const value = parseNumericToken(basePart, field)
  if (value === null) return null

  return {
    kind: 'value',
    start: value,
    step
  }
}

function parseField(rawField: string, field: CronFieldName): ParsedField | null {
  const fieldParts = rawField.split(',').map((part) => part.trim()).filter(Boolean)
  if (fieldParts.length === 0) return null

  const segments: ParsedSegment[] = []

  for (const part of fieldParts) {
    const parsedSegment = parseSegment(part, field)
    if (!parsedSegment) return null
    segments.push(parsedSegment)
  }

  return {
    raw: rawField,
    segments
  }
}

function parseCron(expression: string, timezone?: string): ParsedCron | null {
  const normalized = normalizeExpression(expression)
  if (!normalized) return null

  const tokens = normalized.split(' ')
  let resolvedTimezone = timezone?.trim() || undefined

  while (tokens.length > 0 && /^(CRON_TZ|TZ)=/i.test(tokens[0])) {
    const [, tzValue = ''] = tokens.shift()!.split('=', 2)
    if (tzValue.trim()) {
      resolvedTimezone = tzValue.trim()
    }
  }

  if (tokens.length !== 5) return null

  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = tokens

  const minute = parseField(minuteRaw, 'minute')
  const hour = parseField(hourRaw, 'hour')
  const dayOfMonth = parseField(domRaw, 'dayOfMonth')
  const month = parseField(monthRaw, 'month')
  const dayOfWeek = parseField(dowRaw, 'dayOfWeek')

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return null
  }

  return {
    expression: tokens.join(' '),
    timezone: resolvedTimezone,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek
  }
}

function isAny(field: ParsedField): boolean {
  return field.segments.length === 1 && field.segments[0].kind === 'wildcard' && !field.segments[0].step
}

function wildcardStep(field: ParsedField): number | null {
  if (field.segments.length !== 1) return null
  const segment = field.segments[0]
  if (segment.kind !== 'wildcard' || !segment.step) return null
  return segment.step
}

function singleValue(field: ParsedField): number | null {
  if (field.segments.length !== 1) return null
  const segment = field.segments[0]
  if (segment.kind !== 'value' || segment.step) return null
  return segment.start ?? null
}

function listValues(field: ParsedField): number[] | null {
  const values: number[] = []
  for (const segment of field.segments) {
    if (segment.kind !== 'value' || segment.step || segment.start === undefined) {
      return null
    }
    values.push(segment.start)
  }
  return values
}

function formatValue(field: CronFieldName, value: number): string {
  const formatter = FIELD_DEFINITIONS[field].formatValue
  return formatter ? formatter(value) : String(value)
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const normalizedHour = hour % 12 || 12
  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${period}`
}

function toOrdinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

function describeSegment(field: CronFieldName, segment: ParsedSegment): string {
  const definition = FIELD_DEFINITIONS[field]

  if (segment.kind === 'wildcard') {
    if (segment.step) {
      return `every ${segment.step} ${definition.plural}`
    }
    return `every ${definition.label}`
  }

  if (segment.kind === 'value') {
    const value = formatValue(field, segment.start ?? 0)
    if (segment.step) {
      return `every ${segment.step} ${definition.plural} starting at ${value}`
    }
    return `${definition.label} ${value}`
  }

  const start = formatValue(field, segment.start ?? 0)
  const end = formatValue(field, segment.end ?? 0)
  if (segment.step) {
    return `every ${segment.step} ${definition.plural} from ${start} through ${end}`
  }
  return `${definition.plural} ${start} through ${end}`
}

function describeField(field: CronFieldName, parsedField: ParsedField): string {
  const singleList = listValues(parsedField)
  if (singleList && singleList.length > 1) {
    const values = singleList.map((value) => formatValue(field, value))
    return `${FIELD_DEFINITIONS[field].plural} ${joinWithAnd(values)}`
  }

  return joinWithAnd(parsedField.segments.map((segment) => describeSegment(field, segment)))
}

function describeDayOfWeek(field: ParsedField): string | null {
  const values = listValues(field)
  if (!values || values.length === 0) return null

  const dayNames = values.map((value) => DAY_NAMES[value]).filter(Boolean)
  if (dayNames.length === 0) return null

  return joinWithAnd(dayNames)
}

function describeDayOfMonth(field: ParsedField): string | null {
  const values = listValues(field)
  if (!values || values.length === 0) return null

  return joinWithAnd(values.map((value) => toOrdinal(value)))
}

function describeMonth(field: ParsedField): string | null {
  const values = listValues(field)
  if (!values || values.length === 0) return null

  const monthNames = values.map((value) => MONTH_NAMES[value]).filter(Boolean)
  if (monthNames.length === 0) return null

  return joinWithAnd(monthNames)
}

function withTimezone(text: string, timezone?: string): string {
  const normalizedTimezone = timezone?.trim()
  if (!normalizedTimezone) return text
  return `${text} (${normalizedTimezone})`
}

function humanizeParsedCron(parsed: ParsedCron): string {
  const minuteStep = wildcardStep(parsed.minute)
  const hourStep = wildcardStep(parsed.hour)
  const minuteValue = singleValue(parsed.minute)
  const hourValue = singleValue(parsed.hour)

  const monthAny = isAny(parsed.month)
  const dayOfMonthAny = isAny(parsed.dayOfMonth)
  const dayOfWeekAny = isAny(parsed.dayOfWeek)

  if (isAny(parsed.minute) && isAny(parsed.hour) && dayOfMonthAny && monthAny && dayOfWeekAny) {
    return withTimezone('Every minute', parsed.timezone)
  }

  if (minuteStep && isAny(parsed.hour) && dayOfMonthAny && monthAny && dayOfWeekAny) {
    const everyMinutes = minuteStep === 1 ? 'Every minute' : `Every ${minuteStep} minutes`
    return withTimezone(everyMinutes, parsed.timezone)
  }

  if (minuteValue !== null && isAny(parsed.hour) && dayOfMonthAny && monthAny && dayOfWeekAny) {
    return withTimezone(`Every hour at :${String(minuteValue).padStart(2, '0')}`, parsed.timezone)
  }

  if (minuteValue !== null && hourStep && dayOfMonthAny && monthAny && dayOfWeekAny) {
    if (hourStep === 1) {
      return withTimezone(`Every hour at :${String(minuteValue).padStart(2, '0')}`, parsed.timezone)
    }
    return withTimezone(
      `Every ${hourStep} hours at ${String(minuteValue).padStart(2, '0')} minutes past the hour`,
      parsed.timezone
    )
  }

  if (minuteValue !== null && hourValue !== null && dayOfMonthAny && monthAny && dayOfWeekAny) {
    return withTimezone(`Every day at ${formatTime(hourValue, minuteValue)}`, parsed.timezone)
  }

  if (minuteValue !== null && hourValue !== null && dayOfMonthAny && monthAny && !dayOfWeekAny) {
    const dayLabel = describeDayOfWeek(parsed.dayOfWeek) ?? describeField('dayOfWeek', parsed.dayOfWeek)
    return withTimezone(`Every ${dayLabel} at ${formatTime(hourValue, minuteValue)}`, parsed.timezone)
  }

  if (minuteValue !== null && hourValue !== null && !dayOfMonthAny && monthAny && dayOfWeekAny) {
    const dayLabel = describeDayOfMonth(parsed.dayOfMonth) ?? describeField('dayOfMonth', parsed.dayOfMonth)
    return withTimezone(`Every month on the ${dayLabel} at ${formatTime(hourValue, minuteValue)}`, parsed.timezone)
  }

  if (minuteValue !== null && hourValue !== null && !dayOfMonthAny && !monthAny && dayOfWeekAny) {
    const dayLabel = describeDayOfMonth(parsed.dayOfMonth) ?? describeField('dayOfMonth', parsed.dayOfMonth)
    const monthLabel = describeMonth(parsed.month) ?? describeField('month', parsed.month)
    return withTimezone(`Every year on ${monthLabel} ${dayLabel} at ${formatTime(hourValue, minuteValue)}`, parsed.timezone)
  }

  const fallback = [
    `minute: ${describeField('minute', parsed.minute)}`,
    `hour: ${describeField('hour', parsed.hour)}`,
    `day of month: ${describeField('dayOfMonth', parsed.dayOfMonth)}`,
    `month: ${describeField('month', parsed.month)}`,
    `day of week: ${describeField('dayOfWeek', parsed.dayOfWeek)}`
  ].join('; ')

  return withTimezone(`Schedule -> ${fallback}`, parsed.timezone)
}

export function humanizeCron(expression: string, options: HumanizeCronOptions = {}): string {
  const rawExpression = expression.trim()
  if (!rawExpression) return expression

  const parsed = parseCron(rawExpression, options.timezone ?? undefined)
  if (!parsed) return rawExpression

  return humanizeParsedCron(parsed)
}
