import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { meetingTypesUrl, meetingTypeUrl, server, sessionUrl, slotsUrl } from '@/test/server'
import type { MeetingTypeRead } from '@/lib/meeting-types'

function meetingType(
  overrides: Partial<MeetingTypeRead> & { id: number; title: string },
): MeetingTypeRead {
  return {
    description: null,
    duration_minutes: 30,
    created_at: '2026-11-16T09:00:00',
    bookings_count: 0,
    has_available_slots: true,
    ...overrides,
  }
}

function ownerSession() {
  return HttpResponse.json({
    email: 'owner@example.com',
    is_owner: true,
    owner_name: 'Владелец календаря',
  })
}

function renderApp(initialEntries: string[]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

function cardOf(heading: HTMLElement): HTMLElement {
  const card = heading.closest('article')
  if (!(card instanceof HTMLElement)) {
    throw new Error('Заголовок типа встречи должен быть внутри карточки')
  }
  return card
}

function cardText(heading: HTMLElement): string {
  const card = cardOf(heading)
  return Array.from(card.querySelectorAll('h2, p'))
    .map((element) => element.textContent?.trim() ?? '')
    .join(' ')
}

describe('BookingPage', () => {
  it('показывает типы встреч в порядке сервера: новые сверху', async () => {
    server.use(
      http.get(meetingTypesUrl, () =>
        HttpResponse.json([
          meetingType({
            id: 2,
            title: 'Разбор',
            description: 'Длинный звонок',
            duration_minutes: 60,
          }),
          meetingType({
            id: 1,
            title: 'Знакомство',
            description: 'Короткий звонок',
            duration_minutes: 15,
          }),
        ]),
      ),
    )

    renderApp(['/booking'])

    const headings = await screen.findAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Разбор',
      'Знакомство',
    ])
    expect(cardText(headings[0])).toBe('Разбор Длинный звонок 60 минут')
    expect(cardText(headings[1])).toBe('Знакомство Короткий звонок 15 минут')
  })

  it('не показывает блок описания у типа без описания', async () => {
    server.use(
      http.get(meetingTypesUrl, () =>
        HttpResponse.json([meetingType({ id: 1, title: 'Без описания' })]),
      ),
    )

    renderApp(['/booking'])

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Без описания',
    })
    expect(cardText(heading)).toBe('Без описания 30 минут')
  })

  it('помечает тип, у которого нет свободных слотов', async () => {
    server.use(
      http.get(meetingTypesUrl, () =>
        HttpResponse.json([
          meetingType({ id: 1, title: 'Занято', has_available_slots: false }),
          meetingType({ id: 2, title: 'Свободно', has_available_slots: true }),
        ]),
      ),
    )

    renderApp(['/booking'])

    const taken = await screen.findByRole('heading', { level: 2, name: 'Занято' })
    const free = screen.getByRole('heading', { level: 2, name: 'Свободно' })
    expect(cardText(taken)).toContain('нет свободных слотов')
    expect(cardText(free)).not.toContain('нет свободных слотов')
  })

  it('показывает кнопку создания только владельцу', async () => {
    server.use(http.get(sessionUrl, ownerSession))

    renderApp(['/booking'])

    const link = await screen.findByRole('link', { name: 'Создать тип' })
    expect(link).toHaveAttribute('href', '/owner/types/new')
  })

  it('не показывает кнопку создания гостю', async () => {
    renderApp(['/booking'])

    expect(
      await screen.findByText(/Пока нет ни одного типа встреч/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Создать тип' }),
    ).not.toBeInTheDocument()
  })

  it('открывает календарь выбранного типа по клику на карточку', async () => {
    const user = userEvent.setup()
    const type = meetingType({
      id: 2,
      title: 'Разбор',
      duration_minutes: 60,
    })
    server.use(
      http.get(meetingTypesUrl, () => HttpResponse.json([type])),
      http.get(meetingTypeUrl(2), () => HttpResponse.json(type)),
      http.get(slotsUrl(2), () =>
        HttpResponse.json({
          slots: [{ start: '2026-11-16T06:00:00Z', available: true }],
        }),
      ),
    )

    renderApp(['/booking'])

    const card = await screen.findByRole('link', { name: /Разбор/ })
    expect(card).toHaveAttribute('href', '/booking/2')

    await user.click(card)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Разбор' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: '09:00' }),
    ).toBeInTheDocument()
  })

  it('отличает пустой список от ошибки загрузки и повторяет запрос', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(meetingTypesUrl, () => {
        attempts += 1
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json([])
      }),
    )

    renderApp(['/booking'])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить, попробуйте ещё раз',
    )
    expect(
      screen.queryByText(/Пока нет ни одного типа встреч/),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByText(/Пока нет ни одного типа встреч/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
