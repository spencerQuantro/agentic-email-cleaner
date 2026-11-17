import { loadEnv } from "../env";
import { createDb, runMigrations } from "./client";

const env = loadEnv();
await runMigrations(createDb(env.DATABASE_URL));
console.log(`Migrations applied to ${env.DATABASE_URL}`);
