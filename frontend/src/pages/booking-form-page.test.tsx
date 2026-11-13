import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import type { BookingRead } from '@/lib/bookings'
import type { MeetingTypeRead } from '@/lib/meeting-types'
import {
  bookingUrl,
  bookingsUrl,
  meetingTypeUrl,
  server,
  sessionUrl,
} from '@/test/server'

const START = '2026-11-16T06:00:00Z'

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

const BOOKING: BookingRead = {
  id: 42,
  start: START,
  guest_name: 'Иван',
  guest_email: 'guest@example.com',
  created_at: '2026-11-16T09:00:00',
  meeting_type: { id: 7, title: 'Знакомство', duration_minutes: 60 },
}

function session(email: string | null) {
  return http.get(sessionUrl, () =>
    HttpResponse.json({
      email,
      is_owner: false,
      owner_name: 'Владелец календаря',
    }),
  )
}

function meetingType() {
  return http.get(meetingTypeUrl(MEETING_TYPE.id), () =>
    HttpResponse.json(MEETING_TYPE),
  )
}

function renderBookingForm() {
  render(
    <MemoryRouter
      initialEntries={[
        `/booking/${MEETING_TYPE.id}/${encodeURIComponent(START)}`,
      ]}
    >
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function openForm(email: string | null = 'guest@example.com') {
  server.use(session(email), meetingType())
  renderBookingForm()
  await screen.findByRole('heading', { level: 2, name: 'Знакомство' })
}

function errorResponse(code: string, status: number) {
  return HttpResponse.json(
    { error: { code, message: 'Отказ', fields: {} } },
    { status },
  )
}

describe('BookingFormPage', () => {
  it('показывает выбранный тип, дату и время и предзаполняет email', async () => {
    await openForm()

    const email = await screen.findByLabelText('Email')
    await waitFor(() => expect(email).toHaveValue('guest@example.com'))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Оформление записи' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/понедельник, 16 ноября/)).toBeInTheDocument()
    expect(screen.getByText(/09:00/)).toBeInTheDocument()
    expect(screen.getByText(/60 минут/)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeEnabled()
  })

  it('не отправляет пустое имя и неверный email', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    await openForm(null)
    server.use(
      http.post(bookingsUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(BOOKING, { status: 201 })
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByText('Введите имя')).toBeInTheDocument()
    expect(screen.getByText('Введите email')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'не-почта')
    expect(screen.getByLabelText('Email')).toHaveValue('не-почта')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByText('Введите корректный email')).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('создаёт бронь с изменённым email и ведёт на подтверждение', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    await openForm()
    server.use(
      http.post(bookingsUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(BOOKING, { status: 201 })
      }),
      http.get(bookingUrl(BOOKING.id), () => HttpResponse.json(BOOKING)),
    )
    const email = screen.getByLabelText('Email')
    await waitFor(() => expect(email).toHaveValue('guest@example.com'))

    await user.type(await screen.findByLabelText('Имя'), '  Иван  ')
    await user.clear(email)
    await user.type(email, 'other@example.com')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Бронь №42' }),
    ).toBeInTheDocument()
    expect(posted).toEqual([
      {
        meeting_type_id: MEETING_TYPE.id,
        start: START,
        guest_name: 'Иван',
        guest_email: 'other@example.com',
      },
    ])
  })

  it('не отправляет слишком длинное имя', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    await openForm()
    server.use(
      http.post(bookingsUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(BOOKING, { status: 201 })
      }),
    )

    const name = await screen.findByLabelText('Имя')
    await user.click(name)
    await user.paste('я'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(
      await screen.findByText('Имя не длиннее 100 символов'),
    ).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('объясняет, что выбранное время больше недоступно', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(
      http.post(bookingsUrl, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Проверьте заполнение полей',
              fields: { start: 'Это время недоступно для записи' },
            },
          },
          { status: 422 },
        ),
      ),
    )

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Это время больше недоступно',
    )
    expect(
      screen.getByRole('link', { name: 'Выбрать другое время' }),
    ).toHaveAttribute('href', '/booking/7')
  })

  it('объясняет занятый слот и возвращает в календарь', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(
      http.post(bookingsUrl, () => errorResponse('slot_taken', 409)),
    )

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Это время только что заняли',
    )
    expect(
      screen.getByRole('link', { name: 'Вернуться в календарь' }),
    ).toHaveAttribute('href', '/booking/7')
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
  })

  it('объясняет повторную бронь и ведёт к предстоящим встречам', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(
      http.post(bookingsUrl, () => errorResponse('already_booked', 409)),
    )

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'У вас уже есть предстоящая бронь на этот тип',
    )
    expect(
      screen.getByRole('link', { name: 'Перейти к предстоящим встречам' }),
    ).toHaveAttribute('href', '/bookings')
  })

  it('показывает ошибки полей от сервера и сохраняет введённое', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(
      http.post(bookingsUrl, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Проверьте заполнение полей',
              fields: { guest_email: 'Этот адрес не принимается' },
            },
          },
          { status: 422 },
        ),
      ),
    )

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(
      await screen.findByText('Этот адрес не принимается'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
  })

  it('сообщает о сбое сервера, сохраняет поля и снова включает кнопку', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(
      http.post(bookingsUrl, () => errorResponse('internal_error', 500)),
    )

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить, попробуйте ещё раз',
    )
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
    expect(screen.getByLabelText('Email')).toHaveValue('guest@example.com')
    expect(
      screen.getByRole('button', { name: 'Забронировать' }),
    ).toBeEnabled()
  })

  it('не выдаёт сетевой сбой за конфликт', async () => {
    const user = userEvent.setup()
    await openForm()
    server.use(http.post(bookingsUrl, () => HttpResponse.error()))

    await user.type(await screen.findByLabelText('Имя'), 'Иван')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить, попробуйте ещё раз',
    )
    expect(
      screen.queryByRole('link', { name: 'Вернуться в календарь' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Это время только что заняли'),
    ).not.toBeInTheDocument()
  })
})
