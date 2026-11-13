import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { getBooking } from '@/lib/bookings'
import type { BookingRead } from '@/lib/bookings'
import {
  formatInstantDate,
  formatSlotTime,
  timeZoneName,
  viewerTimeZone,
} from '@/lib/datetime'
import { durationLabel } from '@/lib/meeting-types'
import { LOAD_ERROR, RETRY_LABEL } from '@/lib/messages'

type LoadStatus = 'loading' | 'ready' | 'error' | 'missing'

function BookingConfirmationPage() {
  const params = useParams()
  const bookingId = Number(params.bookingId)
  // Время показывается в поясе смотрящего; пояс подписан рядом со временем.
  const timeZone = viewerTimeZone()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [booking, setBooking] = useState<BookingRead | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setBooking(await getBooking(bookingId))
      setStatus('ready')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setStatus('missing')
      } else {
        setStatus('error')
      }
    }
  }, [bookingId])

  // Экран только читает бронь: перезагрузка страницы не создаёт новую запись.
  useEffect(() => {
    void load()
  }, [load])

  if (status === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Бронь</h1>
        <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (status === 'missing') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Бронь</h1>
        <div className="mt-6 max-w-md space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Бронь не найдена
          </p>
          <Button asChild variant="outline">
            <Link to="/bookings">Предстоящие события</Link>
          </Button>
        </div>
      </section>
    )
  }

  if (status === 'error' || booking === null) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Бронь</h1>
        <div className="mt-6 max-w-md space-y-3">
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
      <h1 className="text-3xl font-semibold tracking-tight">
        Бронь №{booking.id}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Вы записаны на «{booking.meeting_type.title}»
      </p>
      <dl className="mt-8 max-w-lg space-y-3 rounded-xl border border-border bg-card p-6 text-sm shadow-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Дата</dt>
          <dd className="text-right font-medium">
            {formatInstantDate(booking.start, timeZone)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Время</dt>
          <dd className="text-right font-medium">
            {formatSlotTime(booking.start, timeZone)} ·{' '}
            {timeZoneName(timeZone)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Гость</dt>
          <dd className="text-right font-medium">{booking.guest_name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Длительность</dt>
          <dd className="text-right font-medium">
            {durationLabel(booking.meeting_type.duration_minutes)}
          </dd>
        </div>
      </dl>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to="/bookings">Предстоящие события</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/booking">Записаться ещё раз</Link>
        </Button>
      </div>
    </section>
  )
}

export { BookingConfirmationPage }
