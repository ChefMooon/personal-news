import type Database from 'better-sqlite3'

export interface DataSourceModule {
  id: string
  displayName: string
  initialize(db: Database.Database): void
  shutdown(): void
}

const modules: DataSourceModule[] = []

export function registerModule(mod: DataSourceModule): void {
  modules.push(mod)
}

export function initializeAll(db: Database.Database): void {
  for (const mod of modules) {
    mod.initialize(db)
    console.log(`[Sources] Initialized: ${mod.id}`)
  }
}

export function shutdownAll(): void {
  for (const mod of modules) {
    mod.shutdown()
  }
}
