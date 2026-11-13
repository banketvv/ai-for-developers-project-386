// Показ времени в поясе смотрящего: сервер присылает UTC, браузер только рисует.
// Название пояса берётся из Intl, а не из списка констант.
const RU_LOCALE = 'ru-RU'

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function timeZoneName(timeZone: string): string {
  const parts = new Intl.DateTimeFormat(RU_LOCALE, {
    timeZone,
    timeZoneName: 'longGeneric',
  }).formatToParts(new Date())
  return (
    parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone
  )
}

export function localDayKey(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatSlotTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat(RU_LOCALE, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))
}

export function formatInstantDate(instant: string, timeZone: string): string {
  return formatDayLabel(localDayKey(instant, timeZone))
}

// Ключ дня уже приведён к поясу смотрящего, поэтому подпись собирается по UTC:
// полдень UTC не переедет на соседний день.
export function formatDayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat(RU_LOCALE, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dayKey}T12:00:00Z`))
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  const title = new Intl.DateTimeFormat(RU_LOCALE, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1)))
  return title.charAt(0).toUpperCase() + title.slice(1)
}
