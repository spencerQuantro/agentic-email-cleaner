import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp, type AppDeps } from "./app";
import { connectedAccount, gmailFromStoredToken, googleAuthRoutes } from "./auth/google";
import { createDb, runMigrations } from "./db/client";
import { createClaudeClassifier } from "./engine/classifier";
import { NoopMailProvider } from "./engine/mail";
import { runSweep } from "./engine/run";
import { allowedHosts, allowedOrigins, loadEnv, missingLiveConfig } from "./env";
import { nextRunAt, Scheduler } from "./scheduler";
import { DbStore } from "./store/db";
import { MemoryStore } from "./store/memory";

const env = loadEnv();

/** Mode-specific deps; the cross-site allowlists come from the env for every mode. */
type ModeDeps = Omit<AppDeps, "allowedOrigins" | "allowedHosts">;

function demoDeps(): ModeDeps {
  const mail = new NoopMailProvider();
  return {
    store: new MemoryStore(),
    getMail: async () => mail,
    session: async () => ({ mode: "demo", connected: true, email: "you@gmail.com" }),
    nextRunAt: (rules) => nextRunAt(rules.schedule),
  };
}

async function liveDeps(): Promise<ModeDeps> {
  const missing = missingLiveConfig(env);
  if (missing.length) {
    throw new Error(
      `Live mode needs ${missing.join(", ")}. Set them in .env, or run with SWEEP_DEMO=1.`,
    );
  }

  const db = createDb(env.DATABASE_URL);
  await runMigrations(db);
  const store = new DbStore(db);

  const auth = {
    db,
    oauth: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    },
    encryptionKey: env.TOKEN_ENCRYPTION_KEY!,
    webOrigin: env.WEB_ORIGIN,
  };
  const getMail = () => gmailFromStoredToken(auth);
  const classify = createClaudeClassifier({
    apiKey: env.ANTHROPIC_API_KEY!,
    model: env.ANTHROPIC_MODEL,
  });

  const scheduler = new Scheduler(async () => {
    const mail = await getMail();
    if (!mail) return { skipped: true, reason: "Gmail not connected" };
    return runSweep({ store, mail, classify });
  });
  scheduler.apply((await store.getRules()).schedule);

  return {
    store,
    getMail,
    session: async () => {
      const account = await connectedAccount(db);
      return { mode: "live", connected: !!account, email: account?.email ?? null };
    },
    runNow: () => scheduler.runNow(),
    onRulesChanged: (rules) => scheduler.apply(rules.schedule),
    nextRunAt: (rules) => nextRunAt(rules.schedule),
    authRoutes: googleAuthRoutes(auth),
  };
}

const deps = env.SWEEP_DEMO ? demoDeps() : await liveDeps();
const auth = env.APP_PASSWORD
  ? {
      password: env.APP_PASSWORD,
      // Live mode always has TOKEN_ENCRYPTION_KEY; demo mode without it signs with a per-start key.
      signingSecret: env.TOKEN_ENCRYPTION_KEY ?? randomBytes(32).toString("base64"),
      secure: env.WEB_ORIGIN.startsWith("https:"),
    }
  : undefined;
const app = createApp({
  ...deps,
  webOrigin: env.WEB_ORIGIN,
  allowedOrigins: allowedOrigins(env),
  allowedHosts: allowedHosts(env),
  auth,
});

// In production the server also serves the built web app (single container).
if (env.WEB_DIST && existsSync(env.WEB_DIST)) {
  app.use("/*", serveStatic({ root: env.WEB_DIST }));
  app.get("*", serveStatic({ path: `${env.WEB_DIST}/index.html` }));
}

serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  console.log(
    `Sweep server on http://${env.HOST}:${info.port} (${env.SWEEP_DEMO ? "demo" : "live"} mode)`,
  );
});
