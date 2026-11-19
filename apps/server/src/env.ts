import { z } from "zod";

const flag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const EnvFields = z.object({
  SWEEP_DEMO: flag,
  PORT: z.coerce.number().int().default(8787),
  /** Interface the server listens on. Use 0.0.0.0 to accept other machines or containers. */
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().default("./data/sweep.db"),
  /** Defaults to http://localhost:<WEB_PORT>, so the custom-port dev command needs no extra vars. */
  WEB_ORIGIN: z.string().optional(),
  WEB_PORT: z.coerce.number().int().optional(),
  /** Extra comma-separated host[:port] values the server may be reached by. */
  ALLOWED_HOSTS: z.string().optional(),
  /** Directory of the built web app, served in production. */
  WEB_DIST: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /** Shared password for the app. Required in live mode, optional in demo mode. */
  APP_PASSWORD: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:8787/auth/google/callback"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
});

const EnvSchema = EnvFields.transform((env) => ({
  ...env,
  WEB_ORIGIN: env.WEB_ORIGIN ?? `http://localhost:${env.WEB_PORT ?? 5173}`,
}));

export type Env = z.infer<typeof EnvSchema>;

/** Empty strings from .env files count as "not set". */
function clean(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(clean(source));
}

/** Lists the settings live mode needs that are missing. Empty means ready. */
export function missingLiveConfig(env: Env): string[] {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ANTHROPIC_API_KEY",
    "TOKEN_ENCRYPTION_KEY",
    "APP_PASSWORD",
  ] as const;
  return required.filter((key) => !env[key]);
}

/** Origins allowed to send mutating API requests. */
export function allowedOrigins(env: Env): string[] {
  return [
    new URL(env.WEB_ORIGIN).origin,
    `http://localhost:${env.PORT}`,
    `http://127.0.0.1:${env.PORT}`,
  ];
}

/** Host header values the API answers to; anything else may be a DNS-rebinding attempt. */
export function allowedHosts(env: Env): string[] {
  const extra = (env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return [
    new URL(env.WEB_ORIGIN).host,
    new URL(env.GOOGLE_REDIRECT_URI).host,
    `localhost:${env.PORT}`,
    `127.0.0.1:${env.PORT}`,
    ...extra,
  ].map((host) => host.toLowerCase());
}
