import { expect, test } from '@playwright/test'
import { OWNER_EMAIL } from './support/api'

test('владелец входит, создаёт, правит и удаляет тип встречи', async ({
  page,
}) => {
  await page.goto('/owner')
  await page.getByLabel('Email владельца').fill(OWNER_EMAIL)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText(/Вы вошли как владелец/)).toBeVisible()

  await page.goto('/booking')
  await page.getByRole('link', { name: 'Создать тип' }).click()
  await page.getByLabel('Название').fill('Консультация')
  await page.getByLabel('Длительность').selectOption('45')
  await page.getByRole('button', { name: 'Создать', exact: true }).click()

  await expect(page.getByText('Тип создан')).toBeVisible()
  await expect(page.getByText('Консультация')).toBeVisible()

  await page.getByRole('link', { name: 'Изменить Консультация' }).click()
  await page.getByLabel('Название').fill('Разбор')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByText('Тип сохранён')).toBeVisible()
  await expect(page.getByText('Разбор')).toBeVisible()

  await page.getByRole('link', { name: 'Изменить Разбор' }).click()
  await page.getByRole('button', { name: 'Удалить тип' }).click()
  await expect(page.getByText(/Будет удалён тип|Тип будет удалён/)).toBeVisible()
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()

  await expect(page.getByText('Тип удалён')).toBeVisible()
  await expect(page.getByText('Разбор')).toHaveCount(0)
})
