#!/usr/bin/env node
// Пересобирает все артефакты контракта: TypeSpec → OpenAPI → TS-типы → Pydantic-модели.
// Запускается через `mise run api:generate`, вручную из api/ — `npm run generate`.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

const apiDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(apiDir)
const openapiFile = join(apiDir, 'openapi', 'openapi.yaml')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

/**
 * TypeSpec описывает union числовых литералов как `type: number`, хотя значения
 * целые. OpenAPI не знает «целочисленный enum», поэтому приводим такие схемы
 * к `integer`: иначе сгенерированные клиент и модели получат числа с плавающей
 * точкой, а бэкенд отдаёт int.
 */
function normalizeIntegerEnums(node) {
  if (Array.isArray(node)) {
    node.forEach(normalizeIntegerEnums)
    return
  }
  if (node === null || typeof node !== 'object') {
    return
  }
  if (Array.isArray(node.enum) && node.type === 'number') {
    if (node.enum.every((value) => Number.isInteger(value))) {
      node.type = 'integer'
    }
  }
  Object.values(node).forEach(normalizeIntegerEnums)
}

console.log('→ TypeSpec → OpenAPI')
run('npx', ['--no-install', 'tsp', 'compile', '.'], apiDir)

const openapi = parse(readFileSync(openapiFile, 'utf8'))
normalizeIntegerEnums(openapi)
writeFileSync(openapiFile, stringify(openapi, { lineWidth: 0 }), 'utf8')

console.log('→ OpenAPI → TypeScript-типы')
run(
  'npx',
  [
    '--no-install',
    'openapi-typescript',
    'openapi/openapi.yaml',
    '-o',
    '../frontend/src/api/schema.d.ts',
  ],
  apiDir,
)

console.log('→ OpenAPI → Pydantic-модели')
run(
  'uv',
  [
    'run',
    'datamodel-codegen',
    '--input',
    '../api/openapi/openapi.yaml',
    '--input-file-type',
    'openapi',
    '--output',
    'app/schemas/contract.py',
    '--output-model-type',
    'pydantic_v2.BaseModel',
    '--base-class',
    'app.schemas.base.ContractModel',
    '--target-python-version',
    '3.13',
    '--use-standard-collections',
    '--use-union-operator',
    '--field-constraints',
    '--use-annotated',
    '--collapse-constrained-root-models-as-annotated',
    '--enum-field-as-literal',
    'all',
    '--collapse-root-models',
    '--output-datetime-class',
    'datetime',
    '--disable-timestamp',
    '--openapi-scopes',
    'schemas',
    '--formatters',
    'ruff-check',
    'ruff-format',
  ],
  join(repoRoot, 'backend'),
)

console.log('Готово: OpenAPI, TS-типы и Pydantic-модели пересобраны.')
