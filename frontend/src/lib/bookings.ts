import { apiRequest } from '@/lib/api'

export type BookingMeetingType = {
  id: number
  title: string
  duration_minutes: number
}

export type BookingRead = {
  id: number
  start: string
  guest_name: string
  guest_email: string
  created_at: string
  meeting_type: BookingMeetingType
}

export type BookingCreate = {
  meeting_type_id: number
  start: string
  guest_name: string
  guest_email: string
}

const BOOKINGS_PATH = '/api/v1/bookings'

export function createBooking(input: BookingCreate): Promise<BookingRead> {
  return apiRequest<BookingRead>(BOOKINGS_PATH, {
    method: 'POST',
    body: input,
  })
}

export function listBookings(): Promise<BookingRead[]> {
  return apiRequest<BookingRead[]>(BOOKINGS_PATH)
}

export function getBooking(bookingId: number): Promise<BookingRead> {
  return apiRequest<BookingRead>(`${BOOKINGS_PATH}/${bookingId}`)
}
