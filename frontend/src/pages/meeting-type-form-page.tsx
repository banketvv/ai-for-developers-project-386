import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { createMeetingType } from '@/lib/meeting-types'
import {
  LOAD_ERROR,
  LOGIN_AGAIN_LABEL,
  OWNER_SESSION_INVALID,
  RETRY_LABEL,
  SUBMIT_ERROR,
} from '@/lib/messages'
import { useSession } from '@/lib/session'

const DURATIONS = [15, 30, 45, 60] as const
const TITLE_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 1000

type FieldErrors = {
  title?: string
  description?: string
}

function MeetingTypeFormPage() {
  const { status: sessionStatus, email, isOwner, reload } = useSession()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
      await createMeetingType({
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: Number(duration),
      })
      navigate('/booking', { state: { created: true } })
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'validation_error') {
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

  if (sessionStatus === 'loading') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Создание типа встречи
        </h1>
        <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
      </section>
    )
  }

  if (sessionStatus === 'error') {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Создание типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
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
          Создание типа встречи
        </h1>
        <div className="mt-6 max-w-sm space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {email
              ? OWNER_SESSION_INVALID
              : 'Создавать типы встреч может только владелец.'}
          </p>
          <Button asChild variant="outline">
            <Link to="/owner">
              {email ? LOGIN_AGAIN_LABEL : 'Войти как владелец'}
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Создание типа встречи
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Гости увидят название, описание и длительность в списке типов встреч.
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
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {minutes} минут
              </option>
            ))}
          </select>
        </div>
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            Создать
          </Button>
          <Button asChild variant="outline">
            <Link to="/booking">Отмена</Link>
          </Button>
        </div>
      </form>
    </section>
  )
}

export { MeetingTypeFormPage }
