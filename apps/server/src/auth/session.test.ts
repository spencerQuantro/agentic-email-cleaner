import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { MemoryStore } from "../store/memory";
import { FakeMail } from "../test/fakes";
import type { SessionAuthConfig } from "./session";

const config: SessionAuthConfig = { password: "hunter2", signingSecret: "secret", secure: false };

function setup(auth: SessionAuthConfig | null = config) {
  const mail = new FakeMail();
  // Same paths as the real Google routes, without any network calls.
  const authRoutes = new Hono()
    .get("/google", (c) => c.text("consent"))
    .get("/google/callback", (c) => c.text("callback"));
  const app = createApp({
    store: new MemoryStore(),
    getMail: async () => mail,
    session: async () => ({ mode: "demo", connected: true, email: "you@gmail.com" }),
    nextRunAt: () => null,
    authRoutes,
    auth: auth ?? undefined,
  });
  const json = (path: string, init?: RequestInit) =>
    app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  const login = (password: string) =>
    json("/api/login", { method: "POST", body: JSON.stringify({ password }) });
  return { app, json, login };
}

/** The `name=value` part of the sweep_session Set-Cookie header, if any. */
function sessionCookie(res: Response) {
  const header = res.headers.getSetCookie().find((h) => h.startsWith("sweep_session="));
  return header?.split(";")[0];
}

const exempt = ["/api/health", "/api/login", "/api/logout", "/api/session"];

afterEach(() => {
  vi.useRealTimers();
});

describe("password protection", () => {
  it("returns 401 on every protected route without a cookie", async () => {
    const { app } = setup();
    const routes = app.routes
      .filter((r) => r.method !== "ALL")
      .filter((r) => r.path.startsWith("/api/") || r.path.startsWith("/auth/"))
      .filter((r) => !exempt.includes(r.path))
      .map((r) => ({ method: r.method, path: r.path.replace(/:[^/]+/g, "x") }));
    const labels = routes.map((r) => `${r.method} ${r.path}`);

    expect(labels).toContain("PUT /api/rules");
    expect(labels).toContain("POST /api/runs");
    expect(labels).toContain("GET /auth/google");
    expect(labels).toContain("GET /auth/google/callback");

    for (const { method, path } of routes) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await res.json()).toEqual({ error: expect.any(String) });
    }
  });

  it("leaves health, session, login and logout open", async () => {
    const { json, login } = setup();
    expect((await json("/api/health")).status).toBe(200);
    expect((await json("/api/session")).status).toBe(200);
    expect((await json("/api/logout", { method: "POST" })).status).toBe(200);
    expect((await login("hunter2")).status).toBe(200);
  });

  it("reports a signed-out session without account details", async () => {
    const { json } = setup();
    expect(await (await json("/api/session")).json()).toEqual({
      mode: "demo",
      connected: false,
      email: null,
      signedIn: false,
      authRequired: true,
    });
  });

  it("signs in with the right password and sets a session cookie", async () => {
    const { json, login } = setup();
    const res = await login("hunter2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mode: "demo",
      connected: true,
      email: "you@gmail.com",
      signedIn: true,
      authRequired: true,
    });

    const header = res.headers.getSetCookie().find((h) => h.startsWith("sweep_session="))!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(header).not.toContain("Secure");

    const cookie = sessionCookie(res)!;
    expect((await json("/api/rules", { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await json("/auth/google", { headers: { Cookie: cookie } })).status).toBe(200);
    const session = await (await json("/api/session", { headers: { Cookie: cookie } })).json();
    expect(session).toMatchObject({ signedIn: true, email: "you@gmail.com" });
  });

  it("sets the cookie with Secure for an https origin", async () => {
    const { login } = setup({ ...config, secure: true });
    const res = await login("hunter2");
    expect(res.headers.getSetCookie().find((h) => h.startsWith("sweep_session="))).toContain(
      "Secure",
    );
  });

  it("rejects a wrong password without setting a cookie", async () => {
    const { login } = setup();
    const res = await login("nope");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Wrong password." });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects a tampered cookie", async () => {
    const { json, login } = setup();
    const cookie = sessionCookie(await login("hunter2"))!;
    const value = decodeURIComponent(cookie.slice("sweep_session=".length));
    const dot = value.lastIndexOf(".");
    const [payload, signature] = [value.slice(0, dot), value.slice(dot + 1)];
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);

    const changedValue = `sweep_session=${encodeURIComponent(`${Number(payload) + 1}.${signature}`)}`;
    const changedSignature = `sweep_session=${encodeURIComponent(`${payload}.${flip(signature)}`)}`;
    for (const bad of [changedValue, changedSignature]) {
      expect((await json("/api/rules", { headers: { Cookie: bad } })).status).toBe(401);
    }
  });

  it("rejects a cookie issued under a different password", async () => {
    const other = setup({ ...config, password: "other" });
    const cookie = sessionCookie(await other.login("other"))!;
    const { json } = setup();
    expect((await json("/api/rules", { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it("rejects an expired cookie", async () => {
    vi.useFakeTimers();
    const { json, login } = setup();
    const cookie = sessionCookie(await login("hunter2"))!;
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect((await json("/api/rules", { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it("limits failed logins to five a minute", async () => {
    vi.useFakeTimers();
    const { login } = setup();
    for (let i = 0; i < 5; i++) expect((await login("nope")).status).toBe(401);

    const limited = await login("hunter2");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many attempts. Try again in a minute." });
    expect(sessionCookie(limited)).toBeUndefined();

    vi.advanceTimersByTime(60_000);
    expect((await login("hunter2")).status).toBe(200);
  });

  it("clears the cookie on logout", async () => {
    const { json } = setup();
    const res = await json("/api/logout", { method: "POST" });
    expect(await res.json()).toMatchObject({ signedIn: false, authRequired: true });
    const header = res.headers.getSetCookie().find((h) => h.startsWith("sweep_session="));
    expect(header).toContain("Max-Age=0");
  });

  it("leaves everything open when no password is configured", async () => {
    const { json } = setup(null);
    expect(await (await json("/api/session")).json()).toEqual({
      mode: "demo",
      connected: true,
      email: "you@gmail.com",
      signedIn: true,
      authRequired: false,
    });
    expect((await json("/api/rules")).status).toBe(200);
    expect((await json("/api/review")).status).toBe(200);
    expect((await json("/auth/google")).status).toBe(200);
  });
});
