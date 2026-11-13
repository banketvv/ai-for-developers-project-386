import { apiRequest } from '@/lib/api'

export type MeetingTypeRead = {
  id: number
  title: string
  description: string | null
  duration_minutes: number
  created_at: string
  bookings_count: number
  has_available_slots: boolean
}

export type MeetingTypeCreate = {
  title: string
  description: string | null
  duration_minutes: number
}

const MEETING_TYPES_PATH = '/api/v1/meeting-types'

export function listMeetingTypes(): Promise<MeetingTypeRead[]> {
  return apiRequest<MeetingTypeRead[]>(MEETING_TYPES_PATH)
}

export function getMeetingType(meetingTypeId: number): Promise<MeetingTypeRead> {
  return apiRequest<MeetingTypeRead>(`${MEETING_TYPES_PATH}/${meetingTypeId}`)
}

export function createMeetingType(
  input: MeetingTypeCreate,
): Promise<MeetingTypeRead> {
  return apiRequest<MeetingTypeRead>(MEETING_TYPES_PATH, {
    method: 'POST',
    body: input,
  })
}

export function durationLabel(minutes: number): string {
  return `${minutes} минут`
}
