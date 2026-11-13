import { Button } from '@/components/ui/button'
import { formatDayLabel, formatMonthTitle } from '@/lib/datetime'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type MonthCalendarProps = {
  year: number
  monthIndex: number
  activeDays: Set<string>
  selectedDay: string | null
  onSelect: (dayKey: string) => void
  onNext: () => void
  canGoNext: boolean
}

function dayKey(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, '0')
  return `${year}-${month}-${String(day).padStart(2, '0')}`
}

function buildCells(year: number, monthIndex: number): Array<number | null> {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const leading = (firstWeekday + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
}

function MonthCalendar({
  year,
  monthIndex,
  activeDays,
  selectedDay,
  onSelect,
  onNext,
  canGoNext,
}: MonthCalendarProps) {
  return (
    <section aria-labelledby="month-calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="month-calendar-title"
          className="text-xl font-semibold tracking-tight"
        >
          {formatMonthTitle(year, monthIndex)}
        </h2>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!canGoNext}>
          Следующий месяц
        </Button>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1 text-center text-xs tracking-wide text-muted-foreground uppercase"
      >
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1">
        {buildCells(year, monthIndex).map((day, index) => {
          if (day === null) {
            return <li key={`empty-${index}`} aria-hidden="true" />
          }
          const key = dayKey(year, monthIndex, day)
          const active = activeDays.has(key)
          const selected = selectedDay === key
          return (
            <li key={key}>
              <button
                type="button"
                aria-label={formatDayLabel(key)}
                aria-pressed={selected}
                disabled={!active}
                onClick={() => onSelect(key)}
                className={cn(
                  'flex aspect-square w-full items-center justify-center rounded-md border text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active
                    ? 'border-border bg-card hover:border-brand hover:text-brand'
                    : 'cursor-default border-transparent text-muted-foreground/40',
                  selected &&
                    'border-brand bg-brand text-brand-foreground hover:text-brand-foreground',
                )}
              >
                {day}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export { MonthCalendar }
