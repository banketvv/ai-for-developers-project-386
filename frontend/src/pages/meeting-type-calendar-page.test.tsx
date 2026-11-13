import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import type { SlotRead } from '@/lib/slots'
import { meetingTypeUrl, server, slotsUrl } from '@/test/server'

// Время показывается в поясе смотрящего. Чтобы утверждения не зависели от
// пояса машины, vitest закрепляет TZ=Europe/Moscow в vite.config.ts;
// первый тест проверяет, что закрепление не потерялось.
const VIEWER_TIME_ZONE = 'Europe/Moscow'

const MEETING_TYPE: MeetingTypeRead = {
  id: 7,
  title: 'Знакомство',
  description: 'Короткий звонок',
  duration_minutes: 60,
  created_at: '2026-11-10T09:00:00',
  bookings_count: 0,
  has_available_slots: true,
  duration_locked: false,
}

function slot(iso: string, available = true): SlotRead {
  return { start: iso, available }
}

// Понедельник 16 ноября 2026, 09:00–18:00 по Москве: 06:00–14:00 UTC.
// Четырнадцать часов по Москве — четырнадцать слотов типа на час.
const MONDAY_SLOTS: SlotRead[] = [
  slot('2026-11-16T06:00:00Z'),
  slot('2026-11-16T07:00:00Z'),
  slot('2026-11-16T08:00:00Z'),
  slot('2026-11-16T09:00:00Z'),
  slot('2026-11-16T10:00:00Z'),
  slot('2026-11-16T11:00:00Z', false),
  slot('2026-11-16T12:00:00Z'),
  slot('2026-11-16T13:00:00Z'),
  slot('2026-11-16T14:00:00Z'),
]

const TUESDAY_SLOTS: SlotRead[] = [
  slot('2026-11-17T07:00:00Z'),
  slot('2026-11-17T08:00:00Z'),
]

function serve(meetingType: MeetingTypeRead, slots: SlotRead[]) {
  server.use(
    http.get(meetingTypeUrl(meetingType.id), () =>
      HttpResponse.json(meetingType),
    ),
    http.get(slotsUrl(meetingType.id), () => HttpResponse.json({ slots })),
  )
}

function renderCalendar(meetingTypeId = MEETING_TYPE.id) {
  render(
    <MemoryRouter initialEntries={[`/booking/${meetingTypeId}`]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

function timeZoneName(): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: VIEWER_TIME_ZONE,
    timeZoneName: 'longGeneric',
  }).formatToParts(new Date('2026-11-16T06:00:00Z'))
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('MeetingTypeCalendarPage', () => {
  it('показывает месяц, активные дни и слоты дня в поясе смотрящего', async () => {
    serve(MEETING_TYPE, [...MONDAY_SLOTS, ...TUESDAY_SLOTS])

    renderCalendar()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Знакомство' }),
    ).toBeInTheDocument()
    expect(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ).toBe(VIEWER_TIME_ZONE)
    expect(screen.getByText('Ноябрь 2026 г.')).toBeInTheDocument()
    expect(screen.getByText('60 минут')).toBeInTheDocument()

    const monday = screen.getByRole('button', {
      name: 'понедельник, 16 ноября',
    })
    expect(monday).toBeEnabled()
    expect(monday).toHaveAttribute('aria-pressed', 'true')
    // Выходной и день за пределами 14-дневного окна неактивны.
    expect(
      screen.getByRole('button', { name: 'суббота, 21 ноября' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'понедельник, 30 ноября' }),
    ).toBeDisabled()

    const heading = screen.getByRole('heading', { level: 2, name: /Свободное время/ })
    expect(heading).toHaveTextContent('понедельник, 16 ноября')
    const zone = timeZoneName()
    expect(zone).not.toBe('')
    expect(occurrences(document.body.textContent ?? '', zone)).toBe(1)

    // Слоты идут от 09:00 с шагом в час; 18:00 не начинается, поэтому его нет.
    expect(
      screen.getByRole('link', { name: '09:00' }),
    ).toHaveAttribute('href', '/booking/7/2026-11-16T06%3A00%3A00Z')
    expect(screen.getByRole('link', { name: '13:00' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '18:00' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '14:00' })).toBeDisabled()
  })

  it('открывает оформление записи по клику на слот', async () => {
    const user = userEvent.setup()
    serve(MEETING_TYPE, MONDAY_SLOTS)

    renderCalendar()

    await user.click(await screen.findByRole('link', { name: '09:00' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Оформление записи' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Знакомство' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/понедельник, 16 ноября/)).toBeInTheDocument()
    expect(screen.getByText(/09:00/)).toBeInTheDocument()
  })

  it('переключает сетку слотов при выборе другого дня', async () => {
    const user = userEvent.setup()
    serve(MEETING_TYPE, [...MONDAY_SLOTS, ...TUESDAY_SLOTS])

    renderCalendar()

    const tuesday = await screen.findByRole('button', {
      name: 'вторник, 17 ноября',
    })
    await user.click(tuesday)

    expect(
      screen.getByRole('heading', { level: 2, name: /Свободное время/ }),
    ).toHaveTextContent('вторник, 17 ноября')
    expect(screen.getByRole('link', { name: '10:00' })).toHaveAttribute(
      'href',
      '/booking/7/2026-11-17T07%3A00%3A00Z',
    )
    expect(
      screen.queryByRole('link', { name: '09:00' }),
    ).not.toBeInTheDocument()
  })

  it('делает день неактивным, если свободных слотов нет', async () => {
    serve(MEETING_TYPE, [
      ...MONDAY_SLOTS,
      slot('2026-11-17T07:00:00Z', false),
    ])

    renderCalendar()

    expect(
      await screen.findByRole('button', { name: 'вторник, 17 ноября' }),
    ).toBeDisabled()
  })

  it('сообщает о пустом окне и ведёт назад к списку типов', async () => {
    serve(MEETING_TYPE, MONDAY_SLOTS.map((each) => ({ ...each, available: false })))

    renderCalendar()

    expect(
      await screen.findByText(/В ближайшие две недели нет свободных слотов/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К списку типов' })).toHaveAttribute(
      'href',
      '/booking',
    )
    expect(
      screen.queryByRole('heading', { level: 2, name: /Свободное время/ }),
    ).not.toBeInTheDocument()
  })

  it('отличает ошибку загрузки от пустого окна и повторяет запрос', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(meetingTypeUrl(MEETING_TYPE.id), () =>
        HttpResponse.json(MEETING_TYPE),
      ),
      http.get(slotsUrl(MEETING_TYPE.id), () => {
        attempts += 1
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json({ slots: MONDAY_SLOTS })
      }),
    )

    renderCalendar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить, попробуйте ещё раз',
    )
    expect(
      screen.queryByText(/нет свободных слотов/),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('link', { name: '09:00' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('листает только вперёд: назад листать некуда', async () => {
    const user = userEvent.setup()
    serve(MEETING_TYPE, [
      slot('2026-11-30T06:00:00Z'),
      slot('2026-12-01T06:00:00Z'),
    ])

    renderCalendar()

    expect(await screen.findByText('Ноябрь 2026 г.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Предыдущий/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }))

    expect(screen.getByText('Декабрь 2026 г.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'вторник, 1 декабря' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('heading', { level: 2, name: /Свободное время/ }),
    ).toHaveTextContent('вторник, 1 декабря')
    // Дальше окна нет: последний месяц окна — декабрь.
    expect(
      screen.getByRole('button', { name: 'Следующий месяц' }),
    ).toBeDisabled()
  })
})
