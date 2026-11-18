import { fixtures } from "@sweep/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryStore } from "./store/memory";
import { FakeMail } from "./test/fakes";

function setup() {
  const mail = new FakeMail();
  const app = createApp({
    store: new MemoryStore(),
    getMail: async () => mail,
    session: async () => ({ mode: "demo", connected: true, email: "you@gmail.com" }),
    nextRunAt: () => null,
  });
  const json = (path: string, init?: RequestInit) =>
    app.request(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
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
