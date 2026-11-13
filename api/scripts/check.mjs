#!/usr/bin/env node
// Проверяет, что закоммиченные артефакты контракта совпадают с исходником.
// Пересобирает всё и падает, если git видит расхождение или новый файл.
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(apiDir)
const generateScript = fileURLToPath(import.meta.url).replace(/check\.mjs$/, 'generate.mjs')

const generate = spawnSync(process.execPath, [generateScript], {
  cwd: apiDir,
  stdio: 'inherit',
})
if (generate.status !== 0) {
  process.exit(generate.status ?? 1)
}

const watched = [
  'api/openapi/openapi.yaml',
  'frontend/src/api/schema.d.ts',
  'backend/app/schemas/contract.py',
]

const status = spawnSync('git', ['status', '--porcelain', '--', ...watched], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: true,
})
if (status.stdout.trim()) {
  console.error(status.stdout.trimEnd())
  console.error(
    '\nАртефакты контракта устарели. Запустите `mise run api:generate` и закоммитьте результат.',
  )
  process.exit(1)
}

console.log('Артефакты контракта совпадают с TypeSpec.')
