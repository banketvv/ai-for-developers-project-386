import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MonthCalendar } from '@/components/month-calendar'
import { SlotGrid } from '@/components/slot-grid'
import { Button } from '@/components/ui/button'
import {
  formatDayLabel,
  timeZoneName,
  viewerTimeZone,
} from '@/lib/datetime'
import { durationLabel, getMeetingType } from '@/lib/meeting-types'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import { LOAD_ERROR, RETRY_LABEL } from '@/lib/messages'
import { groupSlotsByDay, listSlots } from '@/lib/slots'
import type { SlotRead } from '@/lib/slots'

type LoadStatus = 'loading' | 'ready' | 'error'

type MonthCursor = {
  year: number
  monthIndex: number
}

function monthOf(dayKey: string): MonthCursor {
  const [year, month] = dayKey.split('-')
  return { year: Number(year), monthIndex: Number(month) - 1 }
}

function monthOrdinal({ year, monthIndex }: MonthCursor): number {
  return year * 12 + monthIndex
}

function nextMonth({ year, monthIndex }: MonthCursor): MonthCursor {
  return monthIndex === 11
    ? { year: year + 1, monthIndex: 0 }
    : { year, monthIndex: monthIndex + 1 }
}

function MeetingTypeCalendarPage() {
  const params = useParams()
  const meetingTypeId = Number(params.meetingTypeId)
  // Время показывается в поясе смотрящего; пояс подписан один раз в заголовке.
  const timeZone = viewerTimeZone()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [meetingType, setMeetingType] = useState<MeetingTypeRead | null>(null)
  const [slots, setSlots] = useState<SlotRead[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [monthCursor, setMonthCursor] = useState<MonthCursor | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const [loadedType, loadedSlots] = await Promise.all([
        getMeetingType(meetingTypeId),
        listSlots(meetingTypeId),
      ])
      setMeetingType(loadedType)
      setSlots(loadedSlots)
      setSelectedDay(null)
      setMonthCursor(null)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [meetingTypeId])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(
    () => groupSlotsByDay(slots, timeZone),
    [slots, timeZone],
  )
  const activeDays = useMemo(
    () =>
      new Set(
        days.filter((day) => day.hasAvailable).map((day) => day.key),
      ),
    [days],
  )
  const currentDay =
    selectedDay && activeDays.has(selectedDay)
      ? selectedDay
      : (days.find((day) => day.hasAvailable)?.key ?? null)
  const firstMonth = days.length > 0 ? monthOf(days[0].key) : null
  const lastMonth =
    days.length > 0 ? monthOf(days[days.length - 1].key) : null
  const shownMonth = monthCursor ?? firstMonth
  const canGoNext =
    shownMonth !== null &&
    lastMonth !== null &&
    monthOrdinal(shownMonth) < monthOrdinal(lastMonth)
  const daySlots = days.find((day) => day.key === currentDay)?.slots ?? []

  function showNextMonth() {
    if (shownMonth === null) {
      return
    }
    const target = nextMonth(shownMonth)
    setMonthCursor(target)
    // Листаем вперёд к слотам этого месяца, а не оставляем выбор в прошлом.
    const firstInTarget = days.find(
      (day) =>
        day.hasAvailable &&
        monthOrdinal(monthOf(day.key)) === monthOrdinal(target),
    )
    if (firstInTarget) {
      setSelectedDay(firstInTarget.key)
    }
  }

  if (status === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (status === 'error' || meetingType === null) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="max-w-md space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <Link
        to="/booking"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Все типы встреч
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {meetingType.title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {durationLabel(meetingType.duration_minutes)}
      </p>
      {meetingType.description ? (
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {meetingType.description}
        </p>
      ) : null}

      {activeDays.size === 0 || shownMonth === null || currentDay === null ? (
        <div className="mt-8 max-w-md space-y-3">
          <p className="text-sm text-muted-foreground">
            В ближайшие две недели нет свободных слотов.
          </p>
          <Button asChild variant="outline">
            <Link to="/booking">К списку типов</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <MonthCalendar
            year={shownMonth.year}
            monthIndex={shownMonth.monthIndex}
            activeDays={activeDays}
            selectedDay={currentDay}
            onSelect={setSelectedDay}
            onNext={showNextMonth}
            canGoNext={canGoNext}
          />
          <section aria-labelledby="day-slots-title">
            <h2
              id="day-slots-title"
              className="text-xl font-semibold tracking-tight"
            >
              Свободное время — {formatDayLabel(currentDay)} ·{' '}
              {timeZoneName(timeZone)}
            </h2>
            <SlotGrid
              meetingTypeId={meetingType.id}
              slots={daySlots}
              timeZone={timeZone}
            />
          </section>
        </div>
      )}
    </section>
  )
}

export { MeetingTypeCalendarPage }
