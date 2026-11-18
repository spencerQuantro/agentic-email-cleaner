import { fixtures } from "@sweep/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./render";
import { server } from "./server";

describe("Review queue", () => {
  it("redirects / to the review queue and lists uncertain senders", async () => {
    const { router } = renderRoute("/");

    expect(await screen.findByRole("heading", { name: "Needs your review" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/review");
    for (const item of fixtures.reviewItems) {
      expect(screen.getByText(item.sender)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Review/ })).toHaveAttribute("aria-current", "page");
  });

  it("sends the decision to the API when the user keeps a sender", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/review/:id/decision", async ({ params, request }) => {
        sent = { id: params.id, ...((await request.json()) as object) };
        return HttpResponse.json({ ...fixtures.reviewItems[0], decision: "kept" });
      }),
    );
    renderRoute("/review");

    const [firstKeep] = await screen.findAllByRole("button", { name: "Keep" });
    await userEvent.click(firstKeep!);

    await waitFor(() => expect(sent).toEqual({ id: "delta", decision: "kept" }));
  });

  it("filters the queue with the pills", async () => {
    renderRoute("/review");

    const all = await screen.findByRole("tab", { name: "All · 7" });
    expect(all).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Unsubscribe · 4" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    const del = screen.getByRole("tab", { name: "Delete · 3" });

    await userEvent.click(del);

    expect(del).toHaveAttribute("aria-selected", "true");
    expect(all).toHaveAttribute("aria-selected", "false");
    for (const item of fixtures.reviewItems) {
      if (item.action === "delete") expect(screen.getByText(item.sender)).toBeInTheDocument();
      else expect(screen.queryByText(item.sender)).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Approve all suggestions (3)" })).toBeEnabled();
  });

  it("approves every pending row in the current filter with Approve all", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post("*/api/review/:id/decision", async ({ params, request }) => {
        const body = (await request.json()) as { decision: string };
        sent.push({ id: params.id, ...body });
        const item = fixtures.reviewItems.find((i) => i.id === params.id);
        return HttpResponse.json({ ...item, decision: body.decision });
      }),
    );
    renderRoute("/review");

    await userEvent.click(await screen.findByRole("tab", { name: "Delete · 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve all suggestions (3)" }));

    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent).toEqual([
      { id: "amazon", decision: "approved" },
      { id: "costco", decision: "approved" },
      { id: "github", decision: "approved" },
    ]);
  });

  it("updates the counts after an action", async () => {
    const decisions = new Map<string, string>();
    server.use(
      http.get("*/api/review", () =>
        HttpResponse.json(
          fixtures.reviewItems.map((item) => ({
            ...item,
            decision: decisions.get(item.id) ?? null,
          })),
        ),
      ),
      http.post("*/api/review/:id/decision", async ({ params, request }) => {
        const { decision } = (await request.json()) as { decision: string };
        decisions.set(params.id as string, decision);
        const item = fixtures.reviewItems.find((i) => i.id === params.id);
        return HttpResponse.json({ ...item, decision });
      }),
    );
    renderRoute("/review");
    const needsReview = () =>
      within(screen.getByRole("region", { name: "Last run summary" }))
        .getByText("Needs review")
        .closest("div")!.parentElement!;

    const [deltaKeep] = await screen.findAllByRole("button", { name: "Keep" });
    expect(needsReview()).toHaveTextContent("7 senders");
    await userEvent.click(deltaKeep!);

    expect(await screen.findByText(/kept, and I'll remember this choice/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All · 6" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Unsubscribe · 3" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delete · 3" })).toBeInTheDocument();
    expect(needsReview()).toHaveTextContent("6 senders");

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);

    expect(await screen.findByText(/moved to Trash \(51 older than 90 days\)/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All · 5" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delete · 2" })).toBeInTheDocument();
    expect(needsReview()).toHaveTextContent("5 senders");
    expect(screen.getByRole("button", { name: "Approve all suggestions (5)" })).toBeInTheDocument();
  });

  it("shows an inline error inside the row when Undo is refused", async () => {
    const message = "An unsubscribe can't be undone. Resubscribe on the sender's site.";
    server.use(
      http.get("*/api/review", () =>
        HttpResponse.json(
          fixtures.reviewItems.map((item) => ({
            ...item,
            decision: item.id === "pragmatic" ? "approved" : null,
          })),
        ),
      ),
      http.delete("*/api/review/:id/decision", () =>
        HttpResponse.json({ error: message }, { status: 409 }),
      ),
    );
    renderRoute("/review");

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    const row = (await screen.findByRole("alert")).closest("li")!;
    expect(within(row).getByRole("alert")).toHaveTextContent(message);
    expect(within(row).getByText("The Pragmatic Engineer")).toBeInTheDocument();
    expect(within(row).getByText(/unsubscribed/)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows the empty state when every row is decided", async () => {
    server.use(
      http.get("*/api/review", () =>
        HttpResponse.json(fixtures.reviewItems.map((item) => ({ ...item, decision: "kept" }))),
      ),
    );
    renderRoute("/review");

    expect(await screen.findByText(/All caught up\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve all suggestions (0)" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "All · 0" })).toBeInTheDocument();
  });
});
