import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { meetingTypesUrl, server, sessionUrl } from '@/test/server'

function ownerSession() {
  return HttpResponse.json({
    email: 'owner@example.com',
    is_owner: true,
    owner_name: 'Владелец календаря',
  })
}

const CREATED = {
  id: 7,
  title: 'Консультация',
  description: 'Час',
  duration_minutes: 60,
  created_at: '2026-11-16T09:00:00',
  bookings_count: 0,
  has_available_slots: true,
  duration_locked: false,
}

function renderApp(initialEntries: string[]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('MeetingTypeFormPage', () => {
  it('не пускает гостя к форме по прямому адресу', async () => {
    renderApp(['/owner/types/new'])

    expect(await screen.findByText(/только владелец/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Войти как владелец' }),
    ).toHaveAttribute('href', '/owner')
  })

  it('объясняет недействительную владельческую сессию и ведёт на вход', async () => {
    server.use(
      http.get(sessionUrl, () =>
        HttpResponse.json({
          email: 'guest@example.com',
          is_owner: false,
          owner_name: 'Владелец календаря',
        }),
      ),
    )

    renderApp(['/owner/types/new'])

    expect(
      await screen.findByText(/Владельческая сессия недействительна/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Войти снова' })).toHaveAttribute(
      'href',
      '/owner',
    )
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument()
  })

  it('показывает владельцу форму с длительностью по умолчанию 30 минут', async () => {
    server.use(http.get(sessionUrl, ownerSession))

    renderApp(['/owner/types/new'])

    expect(await screen.findByLabelText('Название')).toBeInTheDocument()
    expect(screen.getByLabelText('Описание')).toBeInTheDocument()
    expect(screen.getByLabelText('Длительность')).toHaveValue('30')
  })

  it('показывает ошибку у поля и не отправляет пустое название', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    server.use(
      http.get(sessionUrl, ownerSession),
      http.post(meetingTypesUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(CREATED, { status: 201 })
      }),
    )

    renderApp(['/owner/types/new'])

    await user.click(await screen.findByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Введите название')).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('не отправляет слишком длинное описание', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    server.use(
      http.get(sessionUrl, ownerSession),
      http.post(meetingTypesUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(CREATED, { status: 201 })
      }),
    )

    renderApp(['/owner/types/new'])

    await user.type(await screen.findByLabelText('Название'), 'Звонок')
    const description = screen.getByLabelText('Описание')
    await user.click(description)
    await user.paste('я'.repeat(1001))
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(
      await screen.findByText('Описание не длиннее 1000 символов'),
    ).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('после создания возвращает к списку с сообщением «Тип создан»', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    server.use(
      http.get(sessionUrl, ownerSession),
      http.post(meetingTypesUrl, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json(CREATED, { status: 201 })
      }),
      http.get(meetingTypesUrl, () => HttpResponse.json([CREATED])),
    )

    renderApp(['/owner/types/new'])

    await user.type(await screen.findByLabelText('Название'), 'Консультация')
    await user.type(screen.getByLabelText('Описание'), 'Час')
    await user.selectOptions(screen.getByLabelText('Длительность'), '60')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByText('Тип создан')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Запись на звонок' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Консультация' }),
    ).toBeInTheDocument()
    expect(posted).toEqual([
      { title: 'Консультация', description: 'Час', duration_minutes: 60 },
    ])
  })

  it('показывает ошибки полей от сервера', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(sessionUrl, ownerSession),
      http.post(meetingTypesUrl, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Проверьте заполнение полей',
              fields: { title: 'Такое название уже есть' },
            },
          },
          { status: 422 },
        ),
      ),
    )

    renderApp(['/owner/types/new'])

    await user.type(await screen.findByLabelText('Название'), 'Звонок')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(
      await screen.findByText('Такое название уже есть'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Название')).toHaveValue('Звонок')
  })

  it('сообщает о сбое отправки и сохраняет введённые поля', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(sessionUrl, ownerSession),
      http.post(meetingTypesUrl, () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Сломалось' } },
          { status: 500 },
        ),
      ),
    )

    renderApp(['/owner/types/new'])

    const title = await screen.findByLabelText('Название')
    await user.type(title, 'Звонок')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить, попробуйте ещё раз',
    )
    expect(title).toHaveValue('Звонок')
    expect(screen.getByRole('button', { name: 'Создать' })).toBeEnabled()
  })
})
