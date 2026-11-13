import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiRequest } from '@/lib/api'

type SessionRead = {
  email: string | null
  is_owner: boolean
  owner_name: string
}

type SessionState = {
  status: 'loading' | 'ready' | 'error'
  email: string | null
  isOwner: boolean
  ownerName: string
}

type SessionContextValue = SessionState & {
  reload: () => Promise<void>
  logIn: (email: string) => Promise<void>
  logOut: () => Promise<void>
}

const INITIAL_STATE: SessionState = {
  status: 'loading',
  email: null,
  isOwner: false,
  ownerName: '',
}

const SessionContext = createContext<SessionContextValue | null>(null)

function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE)

  const load = useCallback(async () => {
    try {
      const session = await apiRequest<SessionRead>('/api/v1/session')
      setState({
        status: 'ready',
        email: session.email,
        isOwner: session.is_owner,
        ownerName: session.owner_name,
      })
    } catch {
      setState({ ...INITIAL_STATE, status: 'error' })
    }
  }, [])

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }))
    await load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const logIn = useCallback(
    async (email: string) => {
      await apiRequest<null>('/api/v1/session', {
        method: 'POST',
        body: { email },
      })
      await reload()
    },
    [reload],
  )

  const logOut = useCallback(async () => {
    await apiRequest<null>('/api/v1/session', { method: 'DELETE' })
    await reload()
  }, [reload])

  const value = useMemo(
    () => ({ ...state, reload, logIn, logOut }),
    [state, reload, logIn, logOut],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession должен вызываться внутри SessionProvider')
  }
  return value
}

export { SessionProvider, useSession }
