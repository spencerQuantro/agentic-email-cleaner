import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtures } from "@sweep/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { connectedAccount } from "../auth/google";
import { createDb, runMigrations, type Db } from "../db/client";
import { oauthTokens } from "../db/schema";
import { FakeMail } from "../test/fakes";
import { DbStore } from "./db";

describe("DbStore", () => {
  let dir: string;
  let db: Db;
  let store: DbStore;

  beforeEach(async () => {
    // A temp file rather than :memory:, because libSQL transactions open a new connection.
    dir = mkdtempSync(join(tmpdir(), "sweep-"));
    db = createDb(join(dir, "test.db"));
    await runMigrations(db);
    store = new DbStore(db);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("starts with default rules and persists changes", async () => {
    expect(await store.getRules()).toEqual(fixtures.defaultRules);
    await store.saveRules({ ...fixtures.defaultRules, threshold: 90, schedule: "weekly" });
    expect(await store.getRules()).toMatchObject({ threshold: 90, schedule: "weekly" });
  });

  it("replaces pending review items but keeps decided ones", async () => {
    const [a, b, c] = fixtures.reviewItems;
    const payload = { messageIds: ["m1"], oneClickUnsubscribe: true };
    await store.replacePendingReview([
      { item: a!, payload },
      { item: b!, payload },
    ]);
    await store.setDecision(a!.id, "kept");
    await store.replacePendingReview([{ item: c!, payload }]);

    const ids = (await store.listReview()).map((i) => [i.id, i.decision]);
    expect(ids).toEqual([
      [a!.id, "kept"],
      [c!.id, null],
    ]);
    expect(await store.getPayload(c!.id)).toEqual(payload);
    expect((await store.getSummary()).needsReview).toBe(1);
  });

  it("records runs and restores deletes", async () => {
    await store.recordRun({
      title: "Today",
      summary: "1 delete",
      rows: [
        {
          sender: "Wayfair",
          action: "Moved 2 to Trash",
          why: "Promos",
          decidedBy: "auto",
          confidence: 98,
          kind: "delete",
          messageIds: ["x", "y"],
        },
      ],
    });
    const [run] = await store.listActivity();
    const rowId = run!.rows[0]!.id;
    expect(run!.rows[0]).not.toHaveProperty("messageIds");
    expect((await store.getActivityRow(rowId))?.messageIds).toEqual(["x", "y"]);
    expect(await store.markRestored(rowId)).toMatchObject({ restored: true });
  });

  it("remembers kept senders case-insensitively", async () => {
    await store.recordKeep("News@Example.com");
    await store.recordKeep("news@example.com");
    expect(await store.keptSenders()).toEqual(["news@example.com"]);
  });

  it("persists the session generation", async () => {
    expect(await store.getSessionGeneration()).toBe(0);
    expect(await store.bumpSessionGeneration()).toBe(1);
    expect(await store.getSessionGeneration()).toBe(1);
    expect(await new DbStore(createDb(join(dir, "test.db"))).getSessionGeneration()).toBe(1);
  });

  it("leaves the Gmail token alone on logout", async () => {
    await db.insert(oauthTokens).values({
      id: 1,
      email: "you@gmail.com",
      encryptedRefreshToken: "encrypted",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const before = await connectedAccount(db);
    const mail = new FakeMail();
    const app = createApp({
      store,
      getMail: async () => mail,
      session: async () => ({ mode: "live", connected: true, email: "you@gmail.com" }),
      nextRunAt: () => null,
      allowedOrigins: ["http://localhost:5173"],
      allowedHosts: ["localhost:8787"],
      auth: { password: "hunter2", signingSecret: "secret", secure: false },
    });
    // A Host and Origin that pass the cross-site checks.
    const sameSite = { Host: "localhost:8787", Origin: "http://localhost:5173" };
    const login = await app.request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sameSite },
      body: JSON.stringify({ password: "hunter2" }),
    });
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const logout = await app.request("/api/logout", {
      method: "POST",
      headers: { Cookie: cookie, ...sameSite },
    });

    expect(logout.status).toBe(200);
    expect(await connectedAccount(db)).toEqual(before);
    expect(await store.getSessionGeneration()).toBe(1);
  });
});
