import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'

function renderApp(initialEntries: string[]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('AppRoutes', () => {
  it('открывает главную по умолчанию', () => {
    renderApp(['/'])

    expect(
      screen.getByRole('heading', { level: 1, name: 'Calendar' }),
    ).toBeInTheDocument()
  })

  it('ведёт кнопкой на главной к записи на звонок', async () => {
    const user = userEvent.setup()
    renderApp(['/'])

    await user.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Записаться' }),
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Запись на звонок' }),
    ).toBeInTheDocument()
  })

  it('открывает предстоящие события из шапки', async () => {
    const user = userEvent.setup()
    renderApp(['/'])

    await user.click(screen.getByRole('link', { name: 'Предстоящие события' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Предстоящие события' }),
    ).toBeInTheDocument()
  })

  it('возвращает на главную с неизвестного адреса', () => {
    renderApp(['/unknown'])

    expect(
      screen.getByRole('heading', { level: 1, name: 'Calendar' }),
    ).toBeInTheDocument()
  })
})
