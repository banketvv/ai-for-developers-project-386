import { expect, test } from '@playwright/test'
import { seedMeetingType } from './support/api'

// Сценарий проверяет то, чего не видит jsdom: настоящий браузер, настоящий
// бэкенд, настоящая cookie и переходы между экранами.
test('гость записывается на слот и видит бронь в предстоящих', async ({
  page,
}) => {
  await seedMeetingType('Знакомство', 30)

  await page.goto('/booking')
  await page.getByRole('link', { name: /Знакомство/ }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Знакомство' }),
  ).toBeVisible()
  // Пояс подписан один раз в заголовке раздела; браузер теста — Москва.
  await expect(
    page.getByRole('heading', { name: /Свободное время/ }),
  ).toContainText('Москва')

  // Календарь сам выбирает первый день окна; берём первый свободный слот.
  await page.getByRole('link', { name: /^\d{2}:\d{2}$/ }).first().click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Оформление записи' }),
  ).toBeVisible()
  await page.getByLabel('Имя').fill('Иван')
  await page.getByLabel('Email').fill('guest@example.com')
  await page.getByRole('button', { name: 'Забронировать' }).click()

  await expect(
    page.getByRole('heading', { name: /Бронь №\d+/ }),
  ).toBeVisible()
  await expect(page.getByText('Вы записаны на «Знакомство»')).toBeVisible()
  await expect(page.getByText('Иван')).toBeVisible()

  await page
    .getByRole('main')
    .getByRole('link', { name: 'Предстоящие события' })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Предстоящие события' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Знакомство/ })).toBeVisible()

  // Перезагрузка списка не создаёт вторую бронь и не теряет запись.
  await page.reload()
  await expect(page.getByRole('link', { name: /Знакомство/ })).toBeVisible()
})

test('гость без броней видит пустое состояние', async ({ page }) => {
  await page.goto('/bookings')

  await expect(page.getByText(/пока нет/i)).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Записаться', exact: true }),
  ).toBeVisible()
})
