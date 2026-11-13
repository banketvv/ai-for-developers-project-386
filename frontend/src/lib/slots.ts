import type { components } from '@/api/schema'
import { apiClient, unwrap } from '@/lib/api'
import { localDayKey } from '@/lib/datetime'

// Тип слота взят из OpenAPI-контракта: ручные копии разъезжались бы с сервером.
export type SlotRead = components['schemas']['SlotRead']

export type SlotDay = {
  key: string
  slots: SlotRead[]
  hasAvailable: boolean
}

export function listSlots(meetingTypeId: number): Promise<SlotRead[]> {
  return unwrap(
    apiClient.GET('/api/v1/meeting-types/{meeting_type_id}/slots', {
      params: { path: { meeting_type_id: meetingTypeId } },
    }),
  ).then((response) => response.slots)
}

// Раскладку по дням делает клиент: сервер отдаёт плоский список моментов UTC.
export function groupSlotsByDay(
  slots: SlotRead[],
  timeZone: string,
): SlotDay[] {
  const days = new Map<string, SlotDay>()
  for (const slot of slots) {
    const key = localDayKey(slot.start, timeZone)
    const day = days.get(key) ?? { key, slots: [], hasAvailable: false }
    day.slots.push(slot)
    day.hasAvailable = day.hasAvailable || slot.available
    days.set(key, day)
  }
  return [...days.values()]
}
