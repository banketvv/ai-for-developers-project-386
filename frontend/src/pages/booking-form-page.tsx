import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { createBooking } from '@/lib/bookings'
import {
  formatInstantDate,
  formatSlotTime,
  timeZoneName,
  viewerTimeZone,
} from '@/lib/datetime'
import { durationLabel, getMeetingType } from '@/lib/meeting-types'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import { LOAD_ERROR, RETRY_LABEL, SUBMIT_ERROR } from '@/lib/messages'
import { useSession } from '@/lib/session'

const NAME_MAX_LENGTH = 100
// Та же проверка, что и на сервере: форма не отправляет заведомо неверный адрес.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type LoadStatus = 'loading' | 'ready' | 'error'

type FieldErrors = {
  guest_name?: string
  guest_email?: string
}

type Conflict = 'slot_taken' | 'already_booked' | null

function BookingFormPage() {
  const params = useParams()
  const meetingTypeId = Number(params.meetingTypeId)
  // Начало слота приходит из адреса: сервер сам проверит, что оно из его сетки.
  const start = params.start ?? ''
  const navigate = useNavigate()
  const { email: sessionEmail, reload } = useSession()
  // Время показывается в поясе смотрящего; пояс подписан рядом со слотом.
  const timeZone = viewerTimeZone()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [meetingType, setMeetingType] = useState<MeetingTypeRead | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailEdited, setEmailEdited] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [startUnavailable, setStartUnavailable] = useState(false)
  const [conflict, setConflict] = useState<Conflict>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setMeetingType(await getMeetingType(meetingTypeId))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [meetingTypeId])

  useEffect(() => {
    void load()
  }, [load])

  // Почту из cookie подставляем, пока гость не начал её править: поле остаётся свободным.
  useEffect(() => {
    if (!emailEdited && sessionEmail) {
      setEmail(sessionEmail)
    }
  }, [sessionEmail, emailEdited])

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    const trimmedName = name.trim()
    if (!trimmedName) {
      errors.guest_name = 'Введите имя'
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      errors.guest_name = `Имя не длиннее ${NAME_MAX_LENGTH} символов`
    }
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      errors.guest_email = 'Введите email'
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.guest_email = 'Введите корректный email'
    }
    return errors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setConflict(null)
    setStartUnavailable(false)
    const errors = validate()
    setFieldErrors(errors)
    if (errors.guest_name || errors.guest_email) {
      return
    }
    setPending(true)
    try {
      const booking = await createBooking({
        meeting_type_id: meetingTypeId,
        start,
        guest_name: name.trim(),
        guest_email: email.trim(),
      })
      // Cookie уже поставил сервер; обновляем контекст, чтобы он не отставал.
      await reload()
      navigate(`/bookings/${booking.id}`)
    } catch (caught) {
      if (caught instanceof ApiError) {
        handleApiError(caught)
      } else {
        setSubmitError(SUBMIT_ERROR)
      }
    } finally {
      setPending(false)
    }
  }

  function handleApiError(error: ApiError) {
    if (error.code === 'slot_taken' || error.code === 'already_booked') {
      setConflict(error.code)
      return
    }
    if (error.code === 'validation_error') {
      const next: FieldErrors = {
        guest_name: error.fields.guest_name,
        guest_email: error.fields.guest_email,
      }
      setFieldErrors(next)
      if (error.fields.start) {
        setStartUnavailable(true)
      } else if (!next.guest_name && !next.guest_email) {
        setSubmitError(SUBMIT_ERROR)
      }
      return
    }
    // Сеть и 5xx не выдаём за конфликт: поля остаются на месте, кнопка снова активна.
    setSubmitError(SUBMIT_ERROR)
  }

  if (status === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Оформление записи
        </h1>
        <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (status === 'error' || meetingType === null) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Оформление записи
        </h1>
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
      <Link
        to={`/booking/${meetingType.id}`}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← К календарю
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Оформление записи
      </h1>
      <div className="mt-6 max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">
          {meetingType.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatInstantDate(start, timeZone)},{' '}
          {formatSlotTime(start, timeZone)} ·{' '}
          {durationLabel(meetingType.duration_minutes)} ·{' '}
          {timeZoneName(timeZone)}
        </p>
      </div>
      <form className="mt-8 max-w-lg space-y-5" noValidate onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="booking-guest-name">Имя</Label>
          <Input
            id="booking-guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            aria-invalid={fieldErrors.guest_name ? true : undefined}
            aria-describedby={
              fieldErrors.guest_name ? 'booking-guest-name-error' : undefined
            }
          />
          {fieldErrors.guest_name ? (
            <p
              id="booking-guest-name-error"
              className="text-sm text-destructive"
            >
              {fieldErrors.guest_name}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="booking-guest-email">Email</Label>
          <Input
            id="booking-guest-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmailEdited(true)
              setEmail(event.target.value)
            }}
            autoComplete="email"
            aria-invalid={fieldErrors.guest_email ? true : undefined}
            aria-describedby={
              fieldErrors.guest_email
                ? 'booking-guest-email-error'
                : undefined
            }
          />
          {fieldErrors.guest_email ? (
            <p
              id="booking-guest-email-error"
              className="text-sm text-destructive"
            >
              {fieldErrors.guest_email}
            </p>
          ) : null}
        </div>
        {startUnavailable ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Это время больше недоступно
            </p>
            <Button asChild variant="outline">
              <Link to={`/booking/${meetingType.id}`}>
                Выбрать другое время
              </Link>
            </Button>
          </div>
        ) : null}
        {conflict === 'slot_taken' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Это время только что заняли
            </p>
            <Button asChild variant="outline">
              <Link to={`/booking/${meetingType.id}`}>
                Вернуться в календарь
              </Link>
            </Button>
          </div>
        ) : null}
        {conflict === 'already_booked' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              У вас уже есть предстоящая бронь на этот тип
            </p>
            <Button asChild variant="outline">
              <Link to="/bookings">Перейти к предстоящим встречам</Link>
            </Button>
          </div>
        ) : null}
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            Забронировать
          </Button>
          <Button asChild variant="outline">
            <Link to={`/booking/${meetingType.id}`}>Отмена</Link>
          </Button>
        </div>
      </form>
    </section>
  )
}

export { BookingFormPage }
