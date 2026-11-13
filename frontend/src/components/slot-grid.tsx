import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatSlotTime } from '@/lib/datetime'
import type { SlotRead } from '@/lib/slots'

type SlotGridProps = {
  meetingTypeId: number
  slots: SlotRead[]
  timeZone: string
}

function SlotGrid({ meetingTypeId, slots, timeZone }: SlotGridProps) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {slots.map((slot) => (
        <li key={slot.start}>
          {slot.available ? (
            <Button asChild variant="outline" className="w-full">
              <Link to={`/booking/${meetingTypeId}/${slot.start}`}>
                {formatSlotTime(slot.start, timeZone)}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              {formatSlotTime(slot.start, timeZone)}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export { SlotGrid }
