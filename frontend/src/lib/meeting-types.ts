import type { components } from '@/api/schema'
import { apiClient, unwrap } from '@/lib/api'

// Типы взяты из OpenAPI-контракта: ручные копии разъезжались бы с сервером.
export type MeetingTypeRead = components['schemas']['MeetingTypeRead']
export type MeetingTypeCreate = components['schemas']['MeetingTypeCreate']
export type MeetingTypeUpdate = components['schemas']['MeetingTypeUpdate']
export type DurationMinutes = components['schemas']['DurationMinutes']

export function listMeetingTypes(): Promise<MeetingTypeRead[]> {
  return unwrap(apiClient.GET('/api/v1/meeting-types'))
}

export function getMeetingType(meetingTypeId: number): Promise<MeetingTypeRead> {
  return unwrap(
    apiClient.GET('/api/v1/meeting-types/{meeting_type_id}', {
      params: { path: { meeting_type_id: meetingTypeId } },
    }),
  )
}

export function createMeetingType(
  input: MeetingTypeCreate,
): Promise<MeetingTypeRead> {
  return unwrap(apiClient.POST('/api/v1/meeting-types', { body: input }))
}

export function updateMeetingType(
  meetingTypeId: number,
  input: MeetingTypeUpdate,
): Promise<MeetingTypeRead> {
  return unwrap(
    apiClient.PATCH('/api/v1/meeting-types/{meeting_type_id}', {
      params: { path: { meeting_type_id: meetingTypeId } },
      body: input,
    }),
  )
}

export function deleteMeetingType(meetingTypeId: number): Promise<void> {
  return unwrap(
    apiClient.DELETE('/api/v1/meeting-types/{meeting_type_id}', {
      params: { path: { meeting_type_id: meetingTypeId } },
    }),
  )
}

export function durationLabel(minutes: number): string {
  return `${minutes} минут`
}
