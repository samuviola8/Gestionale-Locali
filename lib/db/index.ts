import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";

// Riusa la stessa connessione tra gli hot-reload in sviluppo,
// cosi' non si esauriscono le connessioni a Postgres.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.pgClient ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
