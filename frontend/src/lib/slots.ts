import { apiRequest } from '@/lib/api'
import { localDayKey } from '@/lib/datetime'

export type SlotRead = {
  start: string
  available: boolean
}

export type SlotDay = {
  key: string
  slots: SlotRead[]
  hasAvailable: boolean
}

export function listSlots(meetingTypeId: number): Promise<SlotRead[]> {
  return apiRequest<{ slots: SlotRead[] }>(
    `/api/v1/meeting-types/${meetingTypeId}/slots`,
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
