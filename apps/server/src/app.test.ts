import { fixtures } from "@sweep/shared";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { type AppDeps, createApp } from "./app";
import { MemoryStore } from "./store/memory";
import { FakeMail } from "./test/fakes";

// Matches allowedOrigins/allowedHosts for the default env (WEB_ORIGIN http://localhost:5173, PORT 8787).
const allowedOrigins = ["http://localhost:5173", "http://localhost:8787", "http://127.0.0.1:8787"];
const allowedHosts = ["localhost:5173", "localhost:8787", "127.0.0.1:8787"];

function setup(overrides: Partial<AppDeps> = {}) {
  const mail = new FakeMail();
  const app = createApp({
    store: new MemoryStore(),
    getMail: async () => mail,
    session: async () => ({ mode: "demo", connected: true, email: "you@gmail.com" }),
    nextRunAt: () => null,
    allowedOrigins,
    allowedHosts,
    ...overrides,
  });
  const json = (path: string, init?: RequestInit) =>
    app.request(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Host: "localhost:8787",
        Origin: "http://localhost:5173",
        ...init?.headers,
      },
    });
  return { app, mail, json };
}

describe("API", () => {
  it("serves the review queue", async () => {
    const { json } = setup();
    const res = await json("/review");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(fixtures.reviewItems.length);
  });

  it("includes signals on a review item", async () => {
    const { json } = setup();
    const res = await json("/review/delta");
    const body = (await res.json()) as { signals?: unknown[] };
    expect(body.signals).toHaveLength(4);
  });

  it("lists a sender's recent emails with only subject, date and classification", async () => {
    const { json } = setup();
    const res = await json("/review/delta/emails");
    expect(res.status).toBe(200);
    const emails = (await res.json()) as object[];
    expect(emails).toHaveLength(7);
    for (const email of emails) {
      expect(Object.keys(email).sort()).toEqual(["classification", "date", "subject"]);
    }
  });

  it("returns no recent emails for a sender without any", async () => {
    const { json } = setup();
    const res = await json("/review/pragmatic/emails");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns 404 for recent emails of an unknown sender", async () => {
    const { json } = setup();
    const res = await json("/review/nope/emails");
    expect(res.status).toBe(404);
  });

  it("approves a delete, then undoes it by restoring from Trash", async () => {
    const { json, mail } = setup();

    const approve = await json("/review/amazon/decision", {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(approve.status).toBe(200);
    expect(mail.trashed).toEqual(["demo-amazon"]);

    const summary = (await (await json("/summary")).json()) as { needsReview: number };
    expect(summary.needsReview).toBe(fixtures.reviewItems.length - 1);

    const undo = await json("/review/amazon/decision", { method: "DELETE" });
    expect(await undo.json()).toMatchObject({ decision: null });
    expect(mail.untrashed).toEqual(["demo-amazon"]);
  });

  it("refuses to undo an unsubscribe", async () => {
    const { json } = setup();
    await json("/review/delta/decision", {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    });
    const undo = await json("/review/delta/decision", { method: "DELETE" });
    expect(undo.status).toBe(409);
  });

  it("validates rule updates", async () => {
    const { json } = setup();
    const bad = await json("/rules", {
      method: "PUT",
      body: JSON.stringify({ ...fixtures.defaultRules, threshold: 40 }),
    });
    expect(bad.status).toBe(400);

    const good = await json("/rules", {
      method: "PUT",
      body: JSON.stringify({ ...fixtures.defaultRules, threshold: 90 }),
    });
    expect(((await good.json()) as { threshold: number }).threshold).toBe(90);
  });

  it("restores a deleted activity row only once", async () => {
    const { json } = setup();
    const first = await json("/activity/t2/restore", { method: "POST" });
    expect(await first.json()).toMatchObject({ restored: true });
    const again = await json("/activity/t2/restore", { method: "POST" });
    expect(again.status).toBe(409);
  });
});

describe("cross-site protection", () => {
  const decision = JSON.stringify({ decision: "approved" });
  const routes = [
    { label: "POST /runs", path: "/runs", method: "POST", ok: 200 },
    { label: "POST /activity/:id/restore", path: "/activity/t2/restore", method: "POST", ok: 200 },
    {
      label: "PUT /rules",
      path: "/rules",
      method: "PUT",
      body: JSON.stringify(fixtures.defaultRules),
      ok: 200,
    },
    {
      label: "POST /review/:id/decision",
      path: "/review/amazon/decision",
      method: "POST",
      body: decision,
      ok: 200,
    },
    {
      label: "DELETE /review/:id/decision",
      path: "/review/amazon/decision",
      method: "DELETE",
      ok: 200,
    },
  ];

  /** A request with an allowed Host and only the given Origin/Referer headers. */
  const send = (
    app: ReturnType<typeof setup>["app"],
    route: (typeof routes)[number],
    headers: Record<string, string>,
  ) =>
    app.request(`/api${route.path}`, {
      method: route.method,
      body: route.body,
      headers: { "Content-Type": "application/json", Host: "localhost:8787", ...headers },
    });

  /** Approves amazon first so DELETE has a decision to undo. */
  const setupFor = (route: (typeof routes)[number]) => {
    const runNow = vi.fn(async () => ({ ok: true }));
    const ctx = setup({ runNow });
    const ready = async () => {
      if (route.method === "DELETE") {
        const res = await ctx.json("/review/amazon/decision", { method: "POST", body: decision });
        expect(res.status).toBe(200);
      }
    };
    return { ...ctx, runNow, ready };
  };

  for (const route of routes) {
    describe(route.label, () => {
      it("blocks a foreign Origin", async () => {
        const { app, ready } = setupFor(route);
        await ready();
        const res = await send(app, route, { Origin: "https://evil.example" });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Cross-site request blocked" });
      });

      it("blocks a request with no Origin or Referer", async () => {
        const { app, ready } = setupFor(route);
        await ready();
        const res = await send(app, route, {});
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "Cross-site request blocked" });
      });

      it("allows a Referer on the allowed origin", async () => {
        const { app, ready } = setupFor(route);
        await ready();
        const res = await send(app, route, { Referer: "http://localhost:5173/review" });
        expect(res.status).toBe(route.ok);
      });

      it("allows the allowed Origin", async () => {
        const { app, ready } = setupFor(route);
        await ready();
        const res = await send(app, route, { Origin: "http://localhost:5173" });
        expect(res.status).toBe(route.ok);
      });
    });
  }

  it("returns 409 for runs in demo deps once past the check", async () => {
    const { json } = setup();
    const res = await json("/runs", { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("blocks Origin: null", async () => {
    const { json } = setup();
    const res = await json("/runs", { method: "POST", headers: { Origin: "null" } });
    expect(res.status).toBe(403);
  });

  it("never runs or trashes for a blocked request", async () => {
    const { json, mail, runNow } = setupFor(routes[0]!);
    const evil = { Origin: "https://evil.example" };
    expect((await json("/runs", { method: "POST", headers: evil })).status).toBe(403);
    const approve = await json("/review/amazon/decision", {
      method: "POST",
      body: decision,
      headers: evil,
    });
    expect(approve.status).toBe(403);
    expect(runNow).not.toHaveBeenCalled();
    expect(mail.trashed).toEqual([]);
  });

  it("blocks a foreign Host on an /api route", async () => {
    const { json } = setup();
    const res = await json("/summary", { headers: { Host: "evil.example" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Host not allowed" });
  });

  it("blocks a foreign Host on an /auth route", async () => {
    const authRoutes = new Hono().get("/google", (c) => c.text("consent"));
    const { app } = setup({ authRoutes });
    const ok = await app.request("/auth/google", { headers: { Host: "localhost:8787" } });
    expect(ok.status).toBe(200);
    const res = await app.request("/auth/google", { headers: { Host: "evil.example" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Host not allowed" });
  });

  it("blocks a request with no Host", async () => {
    const { app } = setup();
    expect((await app.request("/api/summary")).status).toBe(403);
  });

  it("allows the default hosts", async () => {
    const { json } = setup();
    for (const host of ["localhost:8787", "127.0.0.1:8787", "LOCALHOST:8787"]) {
      expect((await json("/summary", { headers: { Host: host } })).status, host).toBe(200);
    }
  });

  it("allows an extra configured host", async () => {
    const { json } = setup({ allowedHosts: [...allowedHosts, "sweep.lan:8787"] });
    expect((await json("/summary", { headers: { Host: "sweep.lan:8787" } })).status).toBe(200);
  });

  it("allows a GET with no Origin or Referer", async () => {
    const { app } = setup();
    const res = await app.request("/api/summary", { headers: { Host: "localhost:8787" } });
    expect(res.status).toBe(200);
  });
});
