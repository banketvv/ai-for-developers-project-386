import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { server, sessionUrl } from '@/test/server'

const OWNER_EMAIL = 'owner@example.com'
const OWNER_NAME = 'Владелец календаря'

function ownerSession() {
  return HttpResponse.json({
    email: OWNER_EMAIL,
    is_owner: true,
    owner_name: OWNER_NAME,
  })
}

function renderApp(initialEntries: string[]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('OwnerPage', () => {
  it('показывает форму входа по адресу /owner', () => {
    renderApp(['/owner'])

    expect(
      screen.getByRole('heading', { level: 1, name: 'Вход владельца' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email владельца')).toBeInTheDocument()
    expect(
      screen.getByText(/Для тестирования используйте почту/),
    ).toBeInTheDocument()
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
  })

  it('показывает, что вход выполнен, если сервер узнал владельца', async () => {
    server.use(http.get(sessionUrl, ownerSession))
    renderApp(['/owner'])

    expect(await screen.findByText(/Вы вошли как владелец/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Сменить email' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email владельца')).not.toBeInTheDocument()
  })

  it('входит владельцем после отправки своего email', async () => {
    const user = userEvent.setup()
    const posted: unknown[] = []
    let isOwner = false
    server.use(
      http.get(sessionUrl, () =>
        HttpResponse.json(
          isOwner
            ? {
                email: OWNER_EMAIL,
                is_owner: true,
                owner_name: OWNER_NAME,
              }
            : {
                email: null,
                is_owner: false,
                owner_name: OWNER_NAME,
              },
        ),
      ),
      http.post(sessionUrl, async ({ request }) => {
        posted.push(await request.json())
        isOwner = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp(['/owner'])

    await user.type(screen.getByLabelText('Email владельца'), OWNER_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText(/Вы вошли как владелец/)).toBeInTheDocument()
    expect(posted).toEqual([{ email: OWNER_EMAIL }])
  })

  it('отказывает чужому email и оставляет форму с введённым адресом', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(sessionUrl, () =>
        HttpResponse.json(
          { error: { code: 'forbidden', message: 'Чужой адрес' } },
          { status: 403 },
        ),
      ),
    )
    renderApp(['/owner'])

    await user.type(
      screen.getByLabelText('Email владельца'),
      'guest@example.com',
    )
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот email не принадлежит владельцу',
    )
    expect(screen.getByLabelText('Email владельца')).toHaveValue(
      'guest@example.com',
    )
    expect(screen.queryByText(/Вы вошли как владелец/)).not.toBeInTheDocument()
  })

  it('смена email очищает сессию и возвращает к форме', async () => {
    const user = userEvent.setup()
    let isOwner = true
    server.use(
      http.get(sessionUrl, () =>
        HttpResponse.json(
          isOwner
            ? {
                email: OWNER_EMAIL,
                is_owner: true,
                owner_name: OWNER_NAME,
              }
            : {
                email: null,
                is_owner: false,
                owner_name: OWNER_NAME,
              },
        ),
      ),
      http.delete(sessionUrl, () => {
        isOwner = false
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp(['/owner'])

    await user.click(
      await screen.findByRole('button', { name: 'Сменить email' }),
    )

    expect(await screen.findByLabelText('Email владельца')).toHaveValue('')
    expect(screen.queryByText(/Вы вошли как владелец/)).not.toBeInTheDocument()
  })

  it('сообщает о сбое смены email и оставляет сессию владельца', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(sessionUrl, ownerSession),
      http.delete(sessionUrl, () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Сломалось' } },
          { status: 500 },
        ),
      ),
    )
    renderApp(['/owner'])

    await user.click(
      await screen.findByRole('button', { name: 'Сменить email' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить, попробуйте ещё раз',
    )
    expect(screen.getByText(/Вы вошли как владелец/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Сменить email' }),
    ).toBeEnabled()
  })

  it('показывает ошибку загрузки на месте формы и повторяет запрос', async () => {
    const user = userEvent.setup()
    let attempts = 0
    server.use(
      http.get(sessionUrl, () => {
        attempts += 1
        if (attempts === 1) {
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json({
          email: null,
          is_owner: false,
          owner_name: OWNER_NAME,
        })
      }),
    )
    renderApp(['/owner'])

    expect(
      await screen.findByText('Не удалось загрузить, попробуйте ещё раз'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email владельца')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByLabelText('Email владельца')).toBeInTheDocument()
  })

  it('сообщает о сбое отправки и сохраняет введённые поля', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(sessionUrl, () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Сломалось' } },
          { status: 500 },
        ),
      ),
    )
    renderApp(['/owner'])

    const input = screen.getByLabelText('Email владельца')
    await user.type(input, OWNER_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить, попробуйте ещё раз',
    )
    expect(input).toHaveValue(OWNER_EMAIL)
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled()
  })

  it('ведёт на вход владельца скромной ссылкой в шапке', async () => {
    const user = userEvent.setup()
    renderApp(['/'])

    await user.click(screen.getByRole('link', { name: 'Вход владельца' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Вход владельца' }),
    ).toBeInTheDocument()
  })
})
