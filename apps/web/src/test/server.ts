import { fixtures } from "@sweep/shared";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Mock API backed by the same fixtures the server's demo mode uses. */
export const handlers = [
  http.get("*/api/session", () =>
    HttpResponse.json({ mode: "demo", connected: true, email: "you@gmail.com" }),
  ),
  http.get("*/api/summary", () => HttpResponse.json(fixtures.runSummary)),
  http.get("*/api/review", () =>
    HttpResponse.json(fixtures.reviewItems.map((item) => ({ ...item, decision: null }))),
  ),
  http.post("*/api/review/:id/decision", async ({ params, request }) => {
    const item = fixtures.reviewItems.find((i) => i.id === params.id);
    const { decision } = (await request.json()) as { decision: string };
    return HttpResponse.json({ ...item, decision });
  }),
  http.get("*/api/activity", () => HttpResponse.json(fixtures.activityRuns)),
  http.get("*/api/rules", () => HttpResponse.json(fixtures.defaultRules)),
  http.put("*/api/rules", async ({ request }) => HttpResponse.json(await request.json())),
];

export const server = setupServer(...handlers);
