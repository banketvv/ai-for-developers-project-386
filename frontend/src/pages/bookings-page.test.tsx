import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import type { BookingRead } from '@/lib/bookings'
import { bookingsUrl, server, sessionUrl } from '@/test/server'

const EARLIER: BookingRead = {
  id: 42,
  start: '2026-11-16T10:00:00Z',
  guest_name: 'Иван',
  guest_email: 'ivan@example.com',
  created_at: '2026-11-15T09:00:00',
  meeting_type: { id: 7, title: 'Знакомство', duration_minutes: 60 },
}

const LATER: BookingRead = {
  id: 43,
  start: '2026-11-16T11:00:00Z',
  guest_name: 'Мария',
  guest_email: 'maria@example.com',
  created_at: '2026-11-15T09:00:00',
  meeting_type: { id: 8, title: 'Разбор', duration_minutes: 30 },
}

function guestSession(email: string | null) {
  return http.get(sessionUrl, () =>
    HttpResponse.json({
      email,
      is_owner: false,
      owner_name: 'Владелец календаря',
    }),
  )
}

function ownerSession() {
  return http.get(sessionUrl, () =>
    HttpResponse.json({
      email: 'owner@example.com',
      is_owner: true,
      owner_name: 'Владелец календаря',
    }),
  )
}

function renderBookings() {
  render(
    <MemoryRouter initialEntries={['/bookings']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('BookingsPage', () => {
  it('показывает гостю его брони по возрастанию начала со ссылками на бронь', async () => {
    server.use(
      guestSession('ivan@example.com'),
      http.get(bookingsUrl, () => HttpResponse.json([EARLIER, LATER])),
    )

    renderBookings()

    const headings = await screen.findAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Знакомство',
      'Разбор',
    ])
    expect(screen.getByRole('main')).toHaveTextContent('13:00')
    expect(screen.getByRole('main')).toHaveTextContent('14:00')
    expect(screen.getByRole('main')).toHaveTextContent('60 минут')

    const earlierCard = headings[0].closest('a')
    const laterCard = headings[1].closest('a')
    expect(earlierCard).toHaveAttribute('href', '/bookings/42')
    expect(laterCard).toHaveAttribute('href', '/bookings/43')
  })

  it('показывает пустое состояние без поля ввода email', async () => {
    server.use(
      guestSession('guest@example.com'),
      http.get(bookingsUrl, () => HttpResponse.json([])),
    )

    renderBookings()

    expect(
      await screen.findByText(/Пока нет предстоящих встреч/),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', {
        name: 'Записаться',
      }),
    ).toHaveAttribute('href', '/booking')
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('отличает ошибку загрузки от пустого списка и повторяет запрос', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      guestSession(null),
      http.get(bookingsUrl, () => {
        attempts += 1
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json([])
      }),
    )

    renderBookings()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить, попробуйте ещё раз',
    )
    expect(
      screen.queryByText(/Пока нет предстоящих встреч/),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByText(/Пока нет предстоящих встреч/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('показывает владельцу все брони с почтой гостя', async () => {
    server.use(
      ownerSession(),
      http.get(bookingsUrl, () => HttpResponse.json([EARLIER, LATER])),
    )

    renderBookings()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Знакомство' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/ivan@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/maria@example.com/)).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Все предстоящие встречи')
    expect(
      screen.queryByRole('button', { name: 'Сменить email' }),
    ).not.toBeInTheDocument()
  })

  it('смена email очищает cookie и показывает пустое состояние', async () => {
    const user = userEvent.setup()
    let signedIn = true
    server.use(
      http.get(sessionUrl, () =>
        HttpResponse.json({
          email: signedIn ? 'ivan@example.com' : null,
          is_owner: false,
          owner_name: 'Владелец календаря',
        }),
      ),
      http.get(bookingsUrl, () =>
        HttpResponse.json(signedIn ? [EARLIER] : []),
      ),
      http.delete(sessionUrl, () => {
        signedIn = false
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderBookings()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Знакомство' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сменить email' }))

    expect(
      await screen.findByText(/Пока нет предстоящих встреч/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сменить email' }),
    ).not.toBeInTheDocument()
  })
})
