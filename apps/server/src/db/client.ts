import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Migrations live in apps/server/drizzle. This file runs from src/db/ in dev
 * and from the bundled dist/ in production, so resolve from either.
 */
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, here.endsWith("dist") ? "../drizzle" : "../../drizzle");

/** Accepts a file path ("./data/sweep.db"), ":memory:", or a libsql/file URL. */
export function createDb(url: string) {
  let clientUrl = url;
  if (url === ":memory:") {
    clientUrl = "file::memory:";
  } else if (!/^[a-z]+:/i.test(url)) {
    const path = resolve(url);
    mkdirSync(dirname(path), { recursive: true });
    clientUrl = `file:${path}`;
  }
  const client = createClient({ url: clientUrl });
  return drizzle(client, { schema });
}

export async function runMigrations(db: Db, folder = migrationsFolder) {
  await migrate(db, { migrationsFolder: folder });
}
