#!/usr/bin/env node
// Проверяет, что закоммиченные артефакты контракта совпадают с исходником.
// Пересобирает всё и падает, если содержимое разошлось или появился новый файл.
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

// Сравниваем содержимое, а не stat: Windows-чекаут с autocrlf иначе даёт
// ложное «изменено» у только что перезаписанных файлов.
const diff = spawnSync('git', ['diff', '--exit-code', '--', ...watched], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
})
const untracked = spawnSync(
  'git',
  ['ls-files', '--others', '--exclude-standard', '--', ...watched],
  { cwd: repoRoot, encoding: 'utf8', shell: true },
)

if (diff.status !== 0 || untracked.stdout.trim()) {
  if (untracked.stdout.trim()) {
    console.error(untracked.stdout.trimEnd())
  }
  console.error(
    '\nАртефакты контракта устарели. Запустите `mise run api:generate` и закоммитьте результат.',
  )
  process.exit(1)
}

console.log('Артефакты контракта совпадают с TypeSpec.')
