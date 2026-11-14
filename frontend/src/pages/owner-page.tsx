import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { LOAD_ERROR, RETRY_LABEL, SUBMIT_ERROR } from '@/lib/messages'
import { useSession } from '@/lib/session'

const FORBIDDEN_ERROR = 'Этот email не принадлежит владельцу'

function OwnerPage() {
  const { status, isOwner, ownerName, logIn, logOut, reload } = useSession()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await logIn(email)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'forbidden'
          ? FORBIDDEN_ERROR
          : SUBMIT_ERROR,
      )
    } finally {
      setPending(false)
    }
  }

  async function handleChangeEmail() {
    setError(null)
    setPending(true)
    try {
      await logOut()
      setEmail('')
    } catch {
      // Смена почты не удалась: сессия остаётся, отказ виден на месте формы.
      setError(SUBMIT_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Вход владельца</h1>
      {status === 'error' ? (
        <div className="mt-6 max-w-sm space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {LOAD_ERROR}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : isOwner ? (
        <div className="mt-6 max-w-sm space-y-4">
          <p className="text-sm leading-relaxed">
            Вы вошли как владелец{ownerName ? `: ${ownerName}` : ''}.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void handleChangeEmail()}
          >
            Сменить email
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Введите email, указанный в настройках сервиса: он опознаёт вас как
            владельца на этом устройстве.
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Для тестирования используйте почту{' '}
            <span className="font-medium text-foreground">owner@example.com</span>.
          </p>
          <form className="mt-8 max-w-sm space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="owner-email">Email владельца</Label>
              <Input
                id="owner-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              Войти
            </Button>
          </form>
        </>
      )}
    </section>
  )
}

export { OwnerPage }
