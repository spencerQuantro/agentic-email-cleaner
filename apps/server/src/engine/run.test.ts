import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { FakeMail, fakeClassifier, sample } from "../test/fakes";
import { runSweep } from "./run";

describe("runSweep", () => {
  it("auto-acts on obvious junk, queues uncertain senders, and protects the rest", async () => {
    const store = new MemoryStore();
    const mail = new FakeMail([
      // Prefilter handles this one without calling Claude.
      sample({ address: "junk@promo.example", name: "Junk" }),
      // Claude is confident: auto-delete.
      sample({
        address: "old@news.example",
        name: "Old News",
        oneClickUnsubscribe: false,
        openedCount: 2,
      }),
      // Claude is unsure: review.
      sample({ address: "delta@e.delta.example", name: "Delta", openedCount: 5 }),
      // Claude spots receipts: protected.
      sample({ address: "orders@shop.example", name: "Orders", openedCount: 3 }),
    ]);
    const classify = fakeClassifier({
      "old@news.example": { action: "delete", confidence: 97, reason: "Stale digests" },
      "delta@e.delta.example": { action: "unsubscribe", confidence: 62, reason: "Trip mail too" },
      "orders@shop.example": { action: "delete", confidence: 99, categories: ["receipts"] },
    });

    const result = await runSweep({ store, mail, classify });

    expect(result).toMatchObject({
      autoUnsubscribed: 1,
      movedToTrash: 6,
      needsReview: 1,
      protectedCount: 6,
    });
    expect(mail.unsubscribed).toBe(1);
    expect(mail.trashed).toHaveLength(6);

    const pending = (await store.listReview()).filter((i) => i.decision === null);
    expect(pending.map((i) => i.address)).toEqual(["delta@e.delta.example"]);

    const [latest] = await store.listActivity();
    expect(latest?.rows.map((r) => r.sender)).toEqual(["Junk", "Old News"]);
  });

  it("touches nothing in dry-run mode but still logs what it would do", async () => {
    const store = new MemoryStore();
    await store.saveRules({ ...(await store.getRules()), dryRun: true });
    const mail = new FakeMail([sample()]);

    await runSweep({ store, mail, classify: fakeClassifier({}) });

    expect(mail.unsubscribed).toBe(0);
    const [latest] = await store.listActivity();
    expect(latest?.rows[0]).toMatchObject({ action: "Unsubscribed", dryRun: true });
  });

  it("skips senders the user chose to keep", async () => {
    const store = new MemoryStore();
    await store.recordKeep("junk@promo.example");
    const mail = new FakeMail([sample({ address: "junk@promo.example" })]);

    const result = await runSweep({ store, mail, classify: fakeClassifier({}) });

    expect(result.autoUnsubscribed).toBe(0);
    expect(mail.unsubscribed).toBe(0);
  });
});
