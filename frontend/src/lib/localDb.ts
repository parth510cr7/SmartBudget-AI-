/**
 * Native Intelligence – Phase 2: Offline persistence with expo-sqlite.
 * Stores transactions (receipts with store + items) for instant load on Home and Search.
 * Reset wipes this DB via clearLocalData().
 */

import * as SQLite from "expo-sqlite";

const DB_NAME = "smartbudget_local.db";
const TABLE = "transactions";

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

export type TransactionRow = {
  id: string;
  store?: { name?: string; address?: string | null };
  items?: unknown[];
  date?: string;
  total?: number;
  [k: string]: unknown;
};

/**
 * Load all transactions from local DB (newest first by updated_at).
 */
export async function getLocalTransactions(): Promise<TransactionRow[]> {
  try {
    const database = await getDb();
    const rows = await database.getAllAsync<{ data: string }>(
      `SELECT data FROM ${TABLE} ORDER BY updated_at DESC`
    );
    const out: TransactionRow[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data) as TransactionRow;
        if (parsed && typeof parsed.id === "string") out.push(parsed);
      } catch (_) {}
    }
    return out;
  } catch (e) {
    if (__DEV__) console.warn("Local DB getLocalTransactions failed", e);
    return [];
  }
}

/**
 * Save transactions to local DB (replace all for simplicity).
 */
export async function saveLocalTransactions(transactions: TransactionRow[]): Promise<void> {
  if (!Array.isArray(transactions)) return;
  try {
    const database = await getDb();
    const now = Date.now();
    await database.withTransactionAsync(async () => {
      await database.runAsync(`DELETE FROM ${TABLE}`);
      for (const tx of transactions) {
        const id = tx?.id ?? String(Math.random());
        const data = JSON.stringify(tx);
        await database.runAsync(
          `INSERT OR REPLACE INTO ${TABLE} (id, data, updated_at) VALUES (?, ?, ?)`,
          [id, data, now]
        );
      }
    });
  } catch (e) {
    if (__DEV__) console.warn("Local DB saveLocalTransactions failed", e);
  }
}

/**
 * Wipe all local transaction data. Called on Reset App Data.
 */
export async function clearLocalData(): Promise<void> {
  try {
    if (db) {
      await db.runAsync(`DELETE FROM ${TABLE}`);
    } else {
      const database = await getDb();
      await database.runAsync(`DELETE FROM ${TABLE}`);
    }
  } catch (e) {
    if (__DEV__) console.warn("Local DB clearLocalData failed", e);
  }
}

/**
 * Delete the database file entirely (used on full reset so no schema left behind).
 */
export async function deleteLocalDatabase(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (e) {
    if (__DEV__) console.warn("Local DB deleteLocalDatabase failed", e);
  }
}
