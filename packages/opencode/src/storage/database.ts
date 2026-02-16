/**
 * Database Storage Layer
 *
 * Provides a database abstraction for storing session data.
 * Supports SQLite for local development and PostgreSQL for production.
 *
 * This layer will eventually replace the file-based JSON storage.
 */

import { Log } from "@/util/log"
import path from "path"
import { Instance } from "@/project/instance"
import { existsSync } from "fs"
import fs from "fs/promises"

const log = Log.create({ service: "storage.database" })

/**
 * Database type
 */
export type DatabaseType = "sqlite" | "postgresql" | "memory"

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database type */
  type: DatabaseType
  /** Database path (for SQLite) */
  path?: string
  /** Connection URL (for PostgreSQL) */
  url?: string
}

/**
 * Database connection interface
 */
export interface DatabaseConnection {
  /** Execute a query */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>
  /** Execute a statement */
  run(sql: string, params?: any[]): Promise<void>
  /** Close connection */
  close(): Promise<void>
}

/**
 * Get default database configuration
 */
export function getDefaultDatabaseConfig(): DatabaseConfig {
  // Check environment variable
  const dbType = process.env.OPENCODE_DATABASE_TYPE as DatabaseType

  if (dbType === "postgresql") {
    return {
      type: "postgresql",
      url: process.env.OPENCODE_DATABASE_URL,
    }
  }

  // Default to SQLite
  const dbDir = path.join(process.cwd(), ".opencode", "db")
  const dbPath = path.join(dbDir, "opencode.db")

  return {
    type: "sqlite",
    path: dbPath,
  }
}

/**
 * SQLite connection wrapper
 */
class SQLiteConnection implements DatabaseConnection {
  private db: any = null

  constructor(private dbPath: string) {}

  async connect(): Promise<void> {
    try {
      // Lazy import of better-sqlite3
      const betterSqlite3 = await import("better-sqlite3")
      const Database = betterSqlite3.default || betterSqlite3.Database
      this.db = new Database(this.dbPath)

      // Enable WAL mode for better concurrency
      this.db.pragma("journal_mode = WAL")
      this.db.pragma("foreign_keys = ON")

      log.info("Connected to SQLite database", { path: this.dbPath })
    } catch (error) {
      throw new Error(`Failed to connect to SQLite database: ${error}`)
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      await this.connect()
    }

    const statement = this.db.prepare(sql)
    const result = statement.all(...params)
    return result as T[]
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    if (!this.db) {
      await this.connect()
    }

    const statement = this.db.prepare(sql)
    statement.run(...params)
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
      log.info("Closed SQLite database")
    }
  }
}

/**
 * PostgreSQL connection wrapper (placeholder)
 */
class PostgreSQLConnection implements DatabaseConnection {
  constructor(private url: string) {}

  async connect(): Promise<void> {
    // TODO: Implement PostgreSQL connection
    throw new Error("PostgreSQL support not yet implemented")
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    throw new Error("PostgreSQL support not yet implemented")
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    throw new Error("PostgreSQL support not yet implemented")
  }

  async close(): Promise<void> {
    // TODO: Implement PostgreSQL close
  }
}

/**
 * In-memory connection for testing
 */
class MemoryConnection implements DatabaseConnection {
  private store: Map<string, any[]> = new Map()

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Simple in-memory query implementation
    // This is a placeholder for testing
    return []
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    // Simple in-memory run implementation
  }

  async close(): Promise<void> {
    this.store.clear()
  }
}

/**
 * Create database connection
 */
export async function createConnection(config?: DatabaseConfig): Promise<DatabaseConnection> {
  const dbConfig = config ?? getDefaultDatabaseConfig()

  log.info("Creating database connection", { type: dbConfig.type })

  switch (dbConfig.type) {
    case "sqlite":
      // Ensure database directory exists
      if (dbConfig.path) {
        const dbDir = path.dirname(dbConfig.path)
        if (!existsSync(dbDir)) {
          await fs.mkdir(dbDir, { recursive: true })
        }
      }
      const sqlite = new SQLiteConnection(dbConfig.path!)
      await sqlite.connect()
      return sqlite

    case "postgresql":
      const postgres = new PostgreSQLConnection(dbConfig.url!)
      await postgres.connect()
      return postgres

    case "memory":
      return new MemoryConnection()

    default:
      throw new Error(`Unsupported database type: ${dbConfig.type}`)
  }
}

/**
 * Initialize database schema
 */
export async function initializeSchema(db: DatabaseConnection): Promise<void> {
  log.info("Initializing database schema")

  // Sessions table
  await db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      directory TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      share_url TEXT,
      permission TEXT,
      FOREIGN KEY (parent_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  // Messages table
  await db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `)

  // Parts table (for message parts)
  await db.run(`
    CREATE TABLE IF NOT EXISTS parts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `)

  // Projects table
  await db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      directory TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Create indexes for better query performance
  await db.run("CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id)")
  await db.run("CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)")
  await db.run("CREATE INDEX IF NOT EXISTS idx_parts_message_id ON parts(message_id)")

  log.info("Database schema initialized")
}

/**
 * Database storage manager
 */
export class DatabaseStorage {
  private db: DatabaseConnection | null = null
  private initialized = false

  constructor(private config?: DatabaseConfig) {}

  /**
   * Get or create database connection
   */
  async getConnection(): Promise<DatabaseConnection> {
    if (!this.db) {
      this.db = await createConnection(this.config)
    }
    return this.db
  }

  /**
   * Initialize database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const db = await this.getConnection()
    await initializeSchema(db)
    this.initialized = true

    log.info("Database storage initialized")
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.initialized = false
    }
  }

  /**
   * Read a value from the database
   */
  async read<T = any>(key: string[]): Promise<T | null> {
    await this.initialize()

    const db = await this.getConnection()

    // Convert key array to table and ID
    // Example: ["session", "project-123", "session-456"] -> sessions table, session-456
    const [table, ...idParts] = key

    const tableName = table.slice(0, -1) // sessions -> session
    const id = idParts.join("/")

    const rows = await db.query<any>(
      `SELECT * FROM ${tableName}s WHERE id = ?`,
      [id]
    )

    if (rows.length === 0) {
      return null
    }

    return rows[0] as T
  }

  /**
   * Write a value to the database
   */
  async write<T = any>(key: string[], value: T): Promise<void> {
    await this.initialize()

    const db = await this.getConnection()
    const [table, ...idParts] = key

    const tableName = table.slice(0, -1)
    const id = idParts.join("/")

    // Convert value to database columns
    const columns = Object.keys(value as any)
    const placeholders = columns.map(() => "?").join(", ")
    const values = Object.values(value as any)

    await db.run(
      `INSERT OR REPLACE INTO ${tableName}s (${columns.join(", ")}) VALUES (${placeholders})`,
      values
    )

    log.debug("Wrote to database", { table, id })
  }

  /**
   * Remove a value from the database
   */
  async remove(key: string[]): Promise<void> {
    await this.initialize()

    const db = await this.getConnection()
    const [table, ...idParts] = key

    const tableName = table.slice(0, -1)
    const id = idParts.join("/")

    await db.run(`DELETE FROM ${tableName}s WHERE id = ?`, [id])

    log.debug("Removed from database", { table, id })
  }

  /**
   * List all values in a table
   */
  async list<T = any>(key: string[]): Promise<T[]> {
    await this.initialize()

    const db = await this.getConnection()
    const [table, ...prefixParts] = key

    const tableName = table.slice(0, -1)

    let sql = `SELECT * FROM ${tableName}s`
    const params: any[] = []

    if (prefixParts.length > 0) {
      const prefix = prefixParts.join("/") + "%"
      sql += ` WHERE id LIKE ?`
      params.push(prefix)
    }

    const rows = await db.query<any>(sql, params)
    return rows as T[]
  }
}

/**
 * Global database storage instance
 */
let globalStorage: DatabaseStorage | null = null

/**
 * Get global database storage instance
 */
export function getDatabaseStorage(): DatabaseStorage {
  if (!globalStorage) {
    globalStorage = new DatabaseStorage()
  }
  return globalStorage
}

/**
 * Close global database storage
 */
export async function closeDatabaseStorage(): Promise<void> {
  if (globalStorage) {
    await globalStorage.close()
    globalStorage = null
  }
}
