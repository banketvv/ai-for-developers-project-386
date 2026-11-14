import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from '@/pages/home-page'

const features = [
  'Длительность встречи выбирает владелец: 15, 30, 45 или 60 минут; слоты с 09:00 до 18:00.',
  'Проверка конфликта при бронировании.',
  'Просмотр предстоящих событий в отдельном разделе.',
]

function renderHomePage() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('показывает приветствие и возможности сервиса', () => {
    renderHomePage()

    expect(screen.getByText('Быстрая запись на звонок')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Calendar' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Один экран, понятные слоты, быстрая бронь. Выберите время и запишитесь на звонок без лишних шагов.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Что доступно прямо сейчас',
      }),
    ).toBeInTheDocument()
  })

  it('перечисляет три пункта карточки дословно', () => {
    renderHomePage()

    expect(screen.getAllByRole('listitem')).toHaveLength(features.length)
    for (const feature of features) {
      expect(screen.getByText(feature)).toBeInTheDocument()
    }
  })

  it('ведёт кнопкой на запись', () => {
    renderHomePage()

    expect(screen.getByRole('link', { name: 'Записаться' })).toHaveAttribute(
      'href',
      '/booking',
    )
  })
})
