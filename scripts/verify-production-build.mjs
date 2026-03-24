import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const WIN_UNPACKED_DIR = path.join(DIST_DIR, 'win-unpacked')
const EXE_PATH = path.join(WIN_UNPACKED_DIR, 'Personal News.exe')
const RESOURCES_DIR = path.join(WIN_UNPACKED_DIR, 'resources')
const APP_ASAR_PATH = path.join(RESOURCES_DIR, 'app.asar')
const BETTER_SQLITE_NATIVE_PATH = path.join(
  RESOURCES_DIR,
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
)
const MIGRATIONS_DIR = path.join(RESOURCES_DIR, 'migrations')
const SMOKE_OUTPUT_PATH = path.join(DIST_DIR, 'smoke-test-report.json')
const EXPECTED_SCHEMA_VERSION = 1

function run(command, args) {
  const fullCommand = `${command} ${args.join(' ')}`
  console.log(`\n> ${fullCommand}`)
  const result = spawnSync(fullCommand, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true
  })

  if (result.error) {
    throw result.error
  }

  if (typeof result.status !== 'number' || result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'unknown'}): ${fullCommand}`)
  }
}

function assertPathExists(targetPath, message) {
  if (!existsSync(targetPath)) {
    throw new Error(`${message}\nMissing path: ${targetPath}`)
  }
}

function findInstallerPath() {
  const entries = readdirSync(DIST_DIR)
  const setupFile = entries.find((entry) => /-Setup-x64\.exe$/i.test(entry))
  if (!setupFile) {
    throw new Error('Expected Windows setup executable was not found under dist/.')
  }
  return path.join(DIST_DIR, setupFile)
}

function verifySmokeReport() {
  assertPathExists(SMOKE_OUTPUT_PATH, 'Smoke test report missing.')
  const reportRaw = readFileSync(SMOKE_OUTPUT_PATH, 'utf-8')
  const report = JSON.parse(reportRaw)

  if (report.ok !== true) {
    throw new Error('Smoke report indicates failure.')
  }

  if (report.packaged !== true) {
    throw new Error('Smoke report indicates app was not running in packaged mode.')
  }

  if (!report.dbPath || typeof report.dbPath !== 'string') {
    throw new Error('Smoke report is missing dbPath.')
  }

  if (!existsSync(report.dbPath)) {
    throw new Error(`Smoke test database file does not exist: ${report.dbPath}`)
  }

  const schemaVersion = Number.parseInt(String(report.schemaVersion ?? ''), 10)
  if (Number.isNaN(schemaVersion) || schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Schema version check failed. Expected ${EXPECTED_SCHEMA_VERSION}, got ${String(report.schemaVersion)}.`
    )
  }
}

function runPackagedSmokeTest() {
  console.log('\n> Running packaged smoke test')
  const smokeAppData = mkdtempSync(path.join(tmpdir(), 'personal-news-smoke-'))
  const smokeDbPath = path.join(smokeAppData, 'data.db')
  try {
    const result = spawnSync(EXE_PATH, ['--smoke-test', `--smoke-output=${SMOKE_OUTPUT_PATH}`], {
      cwd: WIN_UNPACKED_DIR,
      env: {
        ...process.env,
        APPDATA: smokeAppData,
        PERSONAL_NEWS_DB_PATH: smokeDbPath
      },
      stdio: 'inherit',
      shell: false,
      timeout: 60_000
    })

    if (result.error) {
      throw result.error
    }

    if (typeof result.status !== 'number' || result.status !== 0) {
      throw new Error(`Packaged smoke test failed (${result.status ?? 'unknown'}).`)
    }

    verifySmokeReport()
  } finally {
    rmSync(smokeAppData, { recursive: true, force: true })
  }
}

function verifyBuildOutputs() {
  assertPathExists(DIST_DIR, 'dist/ directory was not created.')
  const installerPath = findInstallerPath()
  assertPathExists(installerPath, 'Windows installer executable missing.')

  assertPathExists(WIN_UNPACKED_DIR, 'win-unpacked/ directory missing.')
  assertPathExists(EXE_PATH, 'Packed app executable missing.')
  assertPathExists(APP_ASAR_PATH, 'app.asar missing from packed resources.')
  assertPathExists(MIGRATIONS_DIR, 'Bundled migrations directory missing.')
  assertPathExists(
    path.join(MIGRATIONS_DIR, '001_initial.sql'),
    'Expected migration file 001_initial.sql missing from packaged resources.'
  )
  const bundledMigrationFiles = readdirSync(MIGRATIONS_DIR).filter((entry) => entry.endsWith('.sql'))
  if (bundledMigrationFiles.length !== 1 || bundledMigrationFiles[0] !== '001_initial.sql') {
    throw new Error(
      `Bundled migrations check failed. Expected only 001_initial.sql, found: ${bundledMigrationFiles.join(', ')}`
    )
  }
  assertPathExists(
    BETTER_SQLITE_NATIVE_PATH,
    'better-sqlite3 native binary missing from packaged app output.'
  )
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('verify-production-build is currently implemented for Windows only.')
  }

  mkdirSync(DIST_DIR, { recursive: true })

  run('npm', ['run', 'build'])
  run('npm', ['run', 'build:win', '--', '--publish=never'])

  verifyBuildOutputs()
  runPackagedSmokeTest()

  console.log('\nProduction build verification passed for Windows.')
}

try {
  main()
} catch (error) {
  console.error('\nProduction build verification failed.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
