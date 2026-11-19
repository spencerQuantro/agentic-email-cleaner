import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";

export interface SessionAuthConfig {
  /** The shared app password (APP_PASSWORD). */
  password: string;
  /** Secret the cookie signing key is derived from (TOKEN_ENCRYPTION_KEY or a random one). */
  signingSecret: string;
  /** Set the cookie with Secure (WEB_ORIGIN is https). */
  secure: boolean;
}

/** The stored session generation. Bumping it revokes every issued cookie. */
export interface SessionGeneration {
  get(): Promise<number>;
  bump(): Promise<number>;
}

const COOKIE = "sweep_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

/** Paths under /api reachable without a session. Everything else is protected. */
const OPEN_PATHS = new Set(["/api/health", "/api/login", "/api/logout", "/api/session"]);

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Socket address of the caller. Proxy headers are never trusted. */
function clientKey(c: Context) {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // No Node socket (e.g. app.request in tests): every caller shares one key.
    return "unknown";
  }
}

/** Password check, signed session cookie, and a per-IP limit on failed logins. */
export function createSessionAuth(config: SessionAuthConfig, generation: SessionGeneration) {
  // Changing the secret, the password or the generation invalidates every issued cookie.
  const key = async () =>
    createHmac("sha256", config.signingSecret)
      .update(`${config.password}:${await generation.get()}`)
      .digest("hex");
  const expected = sha256(config.password);
  const cookieOptions = { path: "/", secure: config.secure };
  const failures = new Map<string, { count: number; resetAt: number }>();

  const signedIn = async (c: Context) => {
    const value = await getSignedCookie(c, await key(), COOKIE);
    if (!value) return false;
    const expiresAt = Number(value);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  };

  const middleware: MiddlewareHandler = async (c, next) => {
    if (OPEN_PATHS.has(c.req.path) || (await signedIn(c))) return next();
    return c.json({ error: "Sign in to continue" }, 401);
  };

  /** Sets the session cookie, or throws 401 for a wrong password and 429 when rate-limited. */
  const login = async (c: Context, password: string) => {
    const now = Date.now();
    for (const [k, entry] of failures) if (entry.resetAt <= now) failures.delete(k);

    const client = clientKey(c);
    const entry = failures.get(client);
    if (entry && entry.count >= MAX_FAILURES) {
      throw new HTTPException(429, { message: "Too many attempts. Try again in a minute." });
    }

    if (!timingSafeEqual(sha256(password), expected)) {
      if (entry) entry.count++;
      else failures.set(client, { count: 1, resetAt: now + WINDOW_MS });
      throw new HTTPException(401, { message: "Wrong password." });
    }

    await setSignedCookie(c, COOKIE, String(now + SESSION_SECONDS * 1000), await key(), {
      ...cookieOptions,
      httpOnly: true,
      sameSite: "Lax",
      maxAge: SESSION_SECONDS,
    });
  };

  /** Clears the cookie; a signed-in caller also revokes every other session. */
  const logout = async (c: Context) => {
    if (await signedIn(c)) await generation.bump();
    deleteCookie(c, COOKIE, cookieOptions);
  };

  return { middleware, signedIn, login, logout };
}
