import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import {
  deleteMeetingType,
  getMeetingType,
  updateMeetingType,
} from '@/lib/meeting-types'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import {
  DURATION_LOCKED,
  LOAD_ERROR,
  RETRY_LABEL,
  SUBMIT_ERROR,
} from '@/lib/messages'
import { useSession } from '@/lib/session'

const DURATIONS = [15, 30, 45, 60] as const
const TITLE_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 1000

type LoadStatus = 'loading' | 'ready' | 'error' | 'not_found'

type FieldErrors = {
  title?: string
  description?: string
}

function bookingsLabel(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod10 === 1 && mod100 !== 11) {
    return 'бронь'
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'брони'
  }
  return 'броней'
}

function MeetingTypeEditPage() {
  const params = useParams()
  const meetingTypeId = Number(params.meetingTypeId)
  const { status: sessionStatus, isOwner, reload: reloadSession } = useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [bookingsCount, setBookingsCount] = useState(0)
  const [durationLocked, setDurationLocked] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const loaded: MeetingTypeRead = await getMeetingType(meetingTypeId)
      setTitle(loaded.title)
      setDescription(loaded.description ?? '')
      setDuration(String(loaded.duration_minutes))
      setBookingsCount(loaded.bookings_count)
      setDurationLocked(loaded.duration_locked)
      setStatus('ready')
    } catch (caught) {
      setStatus(
        caught instanceof ApiError && caught.status === 404
          ? 'not_found'
          : 'error',
      )
    }
  }, [meetingTypeId])

  useEffect(() => {
    if (sessionStatus === 'ready' && isOwner) {
      void load()
    }
  }, [sessionStatus, isOwner, load])

  // Длительность заперта серверными данными о предстоящих бронях, а не догадкой на клиенте.

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      errors.title = 'Введите название'
    } else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
      errors.title = `Название не длиннее ${TITLE_MAX_LENGTH} символов`
    }
    if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
      errors.description = `Описание не длиннее ${DESCRIPTION_MAX_LENGTH} символов`
    }
    return errors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (errors.title || errors.description) {
      return
    }
    setPending(true)
    try {
      await updateMeetingType(meetingTypeId, {
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: Number(duration),
      })
      navigate('/booking', { state: { saved: true } })
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'duration_locked') {
        setSubmitError(DURATION_LOCKED)
      } else if (
        caught instanceof ApiError &&
        caught.code === 'validation_error'
      ) {
        setFieldErrors({
          title: caught.fields.title,
          description: caught.fields.description,
        })
      } else {
        setSubmitError(SUBMIT_ERROR)
      }
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    setSubmitError(null)
    setDeleting(true)
    try {
      await deleteMeetingType(meetingTypeId)
      navigate('/booking', { state: { deleted: true } })
    } catch {
      setSubmitError(SUBMIT_ERROR)
      setDeleting(false)
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (sessionStatus === 'error') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR}
          </p>
          <Button variant="outline" onClick={() => void reloadSession()}>
            {RETRY_LABEL}
          </Button>
        </div>
      </section>
    )
  }

  if (!isOwner) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Редактировать типы встреч может только владелец.
          </p>
          <Button asChild variant="outline">
            <Link to="/owner">Войти как владелец</Link>
          </Button>
        </div>
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (status === 'not_found') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
          <p className="text-sm text-muted-foreground">Тип встречи не найден.</p>
          <Button asChild variant="outline">
            <Link to="/booking">К списку типов</Link>
          </Button>
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Редактирование типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
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
        Редактирование типа встречи
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Название и описание можно менять в любой момент. Длительность
        применяется к новым слотам.
      </p>
      <form className="mt-8 max-w-lg space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="meeting-type-title">Название</Label>
          <Input
            id="meeting-type-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={
              fieldErrors.title ? 'meeting-type-title-error' : undefined
            }
          />
          {fieldErrors.title ? (
            <p
              id="meeting-type-title-error"
              className="text-sm text-destructive"
            >
              {fieldErrors.title}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="meeting-type-description">Описание</Label>
          <textarea
            id="meeting-type-description"
            className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={
              fieldErrors.description
                ? 'meeting-type-description-error'
                : undefined
            }
          />
          {fieldErrors.description ? (
            <p
              id="meeting-type-description-error"
              className="text-sm text-destructive"
            >
              {fieldErrors.description}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="meeting-type-duration">Длительность</Label>
          <select
            id="meeting-type-duration"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            value={duration}
            disabled={durationLocked}
            onChange={(event) => setDuration(event.target.value)}
            aria-describedby={
              durationLocked ? 'meeting-type-duration-locked' : undefined
            }
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {minutes} минут
              </option>
            ))}
          </select>
          {durationLocked ? (
            <p
              id="meeting-type-duration-locked"
              className="text-sm text-muted-foreground"
            >
              {DURATION_LOCKED}
            </p>
          ) : null}
        </div>
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Сохранить
          </Button>
          <Button asChild variant="outline">
            <Link to="/booking">Отмена</Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmingDelete(true)}
            disabled={confirmingDelete}
          >
            Удалить тип
          </Button>
        </div>
      </form>
      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-labelledby="delete-meeting-type-title"
          aria-describedby="delete-meeting-type-description"
          className="mt-8 max-w-lg rounded-xl border border-destructive/40 p-6"
        >
          <h2
            id="delete-meeting-type-title"
            className="text-lg font-semibold tracking-tight"
          >
            Удалить тип встречи?
          </h2>
          <div
            id="delete-meeting-type-description"
            className="mt-2 space-y-2 text-sm text-muted-foreground"
          >
            {bookingsCount > 0 ? (
              <>
                <p>
                  Будет удалён тип и {bookingsCount} {bookingsLabel(bookingsCount)}
                </p>
                <p>Вместе с типом уйдут его брони. Отменить это нельзя.</p>
              </>
            ) : (
              <p>Тип будет удалён безвозвратно. Отменить это нельзя.</p>
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              Удалить
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export { MeetingTypeEditPage }
