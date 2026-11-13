import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { meetingTypesUrl, meetingTypeUrl, server, sessionUrl } from '@/test/server'
import type { MeetingTypeRead } from '@/lib/meeting-types'

const DURATION_LOCKED_HINT =
  'Длительность нельзя изменить: у типа есть предстоящие брони'

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

const CONSULTATION = meetingType({
  id: 3,
  title: 'Консультация',
  description: 'Разбор задач',
  duration_minutes: 60,
})

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

describe('MeetingTypeEditPage', () => {
  it('не пускает гостя к правке по прямому адресу', async () => {
    renderApp(['/owner/types/3/edit'])

    expect(
      await screen.findByText(/Редактировать типы встреч может только владелец/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Войти как владелец' }),
    ).toHaveAttribute('href', '/owner')
  })

  it('открывается с текущими значениями типа встречи', async () => {
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
    )

    renderApp(['/owner/types/3/edit'])

    expect(await screen.findByLabelText('Название')).toHaveValue('Консультация')
    expect(screen.getByLabelText('Описание')).toHaveValue('Разбор задач')
    expect(screen.getByLabelText('Длительность')).toHaveValue('60')
    expect(screen.getByLabelText('Длительность')).toBeEnabled()
  })

  it('блокирует длительность при предстоящих бронях и объясняет причину', async () => {
    const busy = meetingType({
      id: 3,
      title: 'Занятая',
      duration_minutes: 30,
      bookings_count: 2,
    })
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(busy)),
    )

    renderApp(['/owner/types/3/edit'])

    expect(await screen.findByLabelText('Длительность')).toBeDisabled()
    expect(screen.getByText(DURATION_LOCKED_HINT)).toBeInTheDocument()
  })

  it('без броней меняет длительность и возвращает к списку с сообщением', async () => {
    const user = userEvent.setup()
    const patched: unknown[] = []
    const updated = { ...CONSULTATION, title: 'Разбор', duration_minutes: 45 }
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
      http.patch(meetingTypeUrl(3), async ({ request }) => {
        patched.push(await request.json())
        return HttpResponse.json(updated)
      }),
      http.get(meetingTypesUrl, () => HttpResponse.json([updated])),
    )

    renderApp(['/owner/types/3/edit'])

    await user.clear(await screen.findByLabelText('Название'))
    await user.type(screen.getByLabelText('Название'), 'Разбор')
    await user.selectOptions(screen.getByLabelText('Длительность'), '45')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Тип сохранён')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Запись на звонок' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Разбор' }),
    ).toBeInTheDocument()
    expect(patched).toEqual([
      { title: 'Разбор', description: 'Разбор задач', duration_minutes: 45 },
    ])
  })

  it('показывает отказ duration_locked и сохраняет введённые поля', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
      http.patch(meetingTypeUrl(3), () =>
        HttpResponse.json(
          {
            error: {
              code: 'duration_locked',
              message: 'Длительность нельзя изменить',
              fields: {},
            },
          },
          { status: 409 },
        ),
      ),
    )

    renderApp(['/owner/types/3/edit'])

    await user.selectOptions(await screen.findByLabelText('Длительность'), '30')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      DURATION_LOCKED_HINT,
    )
    expect(screen.getByLabelText('Длительность')).toHaveValue('30')
  })

  it('спрашивает подтверждение с числом броней перед удалением', async () => {
    const user = userEvent.setup()
    const busy = meetingType({ id: 3, title: 'Занятая', bookings_count: 3 })
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(busy)),
    )

    renderApp(['/owner/types/3/edit'])

    await user.click(await screen.findByRole('button', { name: 'Удалить тип' }))

    expect(
      screen.getByText('Будет удалён тип и 3 брони'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Отменить это нельзя/)).toBeInTheDocument()
  })

  it('при нуле броней подтверждение короче', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
    )

    renderApp(['/owner/types/3/edit'])

    await user.click(await screen.findByRole('button', { name: 'Удалить тип' }))

    expect(
      screen.getByText('Тип будет удалён безвозвратно. Отменить это нельзя.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Будет удалён тип и/)).not.toBeInTheDocument()
  })

  it('удаляет тип и возвращает к списку с сообщением', async () => {
    const user = userEvent.setup()
    let deleted = 0
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
      http.delete(meetingTypeUrl(3), () => {
        deleted += 1
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(meetingTypesUrl, () => HttpResponse.json([])),
    )

    renderApp(['/owner/types/3/edit'])

    await user.click(await screen.findByRole('button', { name: 'Удалить тип' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByText('Тип удалён')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Консультация' }),
    ).not.toBeInTheDocument()
    expect(deleted).toBe(1)
  })

  it('не удаляет тип, если подтверждение отменили', async () => {
    const user = userEvent.setup()
    let deleted = 0
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => HttpResponse.json(CONSULTATION)),
      http.delete(meetingTypeUrl(3), () => {
        deleted += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp(['/owner/types/3/edit'])

    await user.click(await screen.findByRole('button', { name: 'Удалить тип' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(
      screen.queryByRole('alertdialog'),
    ).not.toBeInTheDocument()
    expect(deleted).toBe(0)
    expect(screen.getByLabelText('Название')).toHaveValue('Консультация')
  })

  it('отличает ошибку загрузки от правки и повторяет запрос', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(sessionUrl, ownerSession),
      http.get(meetingTypeUrl(3), () => {
        attempts += 1
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json(CONSULTATION)
      }),
    )

    renderApp(['/owner/types/3/edit'])

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить, попробуйте ещё раз',
    )

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByLabelText('Название')).toHaveValue('Консультация')
  })
})
