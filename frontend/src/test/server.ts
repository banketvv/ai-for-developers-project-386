import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { apiUrl } from '@/lib/api'

export const sessionUrl = apiUrl('/api/v1/session')
export const meetingTypesUrl = apiUrl('/api/v1/meeting-types')

const defaultHandlers = [
  http.get(sessionUrl, () =>
    HttpResponse.json({
      email: null,
      is_owner: false,
      owner_name: 'Владелец календаря',
    }),
  ),
  http.get(meetingTypesUrl, () => HttpResponse.json([])),
]

export const server = setupServer(...defaultHandlers)
