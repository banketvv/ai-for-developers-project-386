import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { durationLabel, listMeetingTypes } from '@/lib/meeting-types'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import { LOAD_ERROR, MEETING_TYPE_CREATED, RETRY_LABEL } from '@/lib/messages'
import { useSession } from '@/lib/session'

type LoadStatus = 'loading' | 'ready' | 'error'

type CreatedState = {
  created?: boolean
}

function BookingPage() {
  const { isOwner } = useSession()
  const location = useLocation()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [meetingTypes, setMeetingTypes] = useState<MeetingTypeRead[]>([])
  const created = Boolean((location.state as CreatedState | null)?.created)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setMeetingTypes(await listMeetingTypes())
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Запись на звонок</h1>
        {isOwner ? (
          <Button asChild>
            <Link to="/owner/types/new">Создать тип</Link>
          </Button>
        ) : null}
      </div>
      {created ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {MEETING_TYPE_CREATED}
        </p>
      ) : null}
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Выберите подходящий тип встречи и запишитесь на свободное время.
      </p>
      {status === 'error' ? (
        <div className="mt-8 space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : status === 'loading' ? (
        <p className="mt-8 text-sm text-muted-foreground">Загрузка…</p>
      ) : meetingTypes.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Пока нет ни одного типа встреч. Загляните позже.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {meetingTypes.map((meetingType) => (
            <li key={meetingType.id}>
              <article
                aria-labelledby={`meeting-type-${meetingType.id}`}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-sm"
              >
                <h2
                  id={`meeting-type-${meetingType.id}`}
                  className="text-xl font-semibold tracking-tight"
                >
                  {meetingType.title}
                </h2>
                {meetingType.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {meetingType.description}
                  </p>
                ) : null}
                <p className="mt-4 text-sm text-muted-foreground">
                  {durationLabel(meetingType.duration_minutes)}
                </p>
                {meetingType.has_available_slots ? null : (
                  <p className="mt-2 text-sm font-medium">нет свободных слотов</p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export { BookingPage }
