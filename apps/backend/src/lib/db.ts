import "../env.js";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Не задана переменная DATABASE_URL для подключения к PostgreSQL");
}

export const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client: Pool | PoolClient = pool
) => (await client.query<T>(text, values)).rows;

export const queryOne = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client: Pool | PoolClient = pool
) => (await query<T>(text, values, client))[0];

export const transaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const normalizeSnils = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export const maskSnils = (snils: string) =>
  snils.length >= 6 ? `${snils.slice(0, 3)}*****${snils.slice(-3)}` : "***********";
