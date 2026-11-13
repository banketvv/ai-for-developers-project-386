import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { apiUrl } from '@/lib/api'

export const sessionUrl = apiUrl('/api/v1/session')
export const meetingTypesUrl = apiUrl('/api/v1/meeting-types')

export function meetingTypeUrl(id: number): string {
  return apiUrl(`/api/v1/meeting-types/${id}`)
}

export function slotsUrl(id: number): string {
  return apiUrl(`/api/v1/meeting-types/${id}/slots`)
}

export const bookingsUrl = apiUrl('/api/v1/bookings')

export function bookingUrl(id: number): string {
  return apiUrl(`/api/v1/bookings/${id}`)
}


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
