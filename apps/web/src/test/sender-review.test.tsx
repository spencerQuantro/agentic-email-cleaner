import { fixtures } from "@sweep/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./render";
import { server } from "./server";

const delta = fixtures.reviewItems.find((item) => item.id === "delta")!;

/** Records what the decision endpoint receives. */
function captureDecisions() {
  const sent: unknown[] = [];
  server.use(
    http.post("*/api/review/:id/decision", async ({ params, request }) => {
      const body = (await request.json()) as { decision: string };
      sent.push({ id: params.id, ...body });
      return HttpResponse.json({ ...delta, decision: body.decision });
    }),
  );
  return sent;
}

describe("Sender review", () => {
  it("renders the header, explainer, signals and recent emails", async () => {
    renderRoute("/review/delta");

    expect(await screen.findByRole("heading", { level: 1, name: "Delta Air Lines" })).toBeVisible();
    expect(screen.getByText("Auto-act threshold: 95%")).toBeInTheDocument();
    for (const signal of delta.signals!) {
      expect(screen.getByText(signal.text, { exact: false })).toBeInTheDocument();
    }
    const emails = screen.getByRole("region", { name: "Recent emails from this sender" });
    expect(within(emails).getAllByRole("listitem")).toHaveLength(7);
    expect(within(emails).getByText("Nov 12")).toBeInTheDocument();
  });

  it("offers four radios with the suggestion checked and the second disabled", async () => {
    renderRoute("/review/delta");

    const group = await screen.findByRole("group", { name: "What should I do?" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(radios[0]).toBeChecked();
    expect(radios[0]).toHaveAccessibleName(
      /^Unsubscribe\s*Suggested\s*Sends the sender's one-click unsubscribe\. This can't be undone\.$/,
    );
    expect(radios[1]).toBeDisabled();
  });

  it("moves the selection with arrow keys, skipping the disabled option", async () => {
    renderRoute("/review/delta");

    const suggested = await screen.findByRole("radio", { name: /^Unsubscribe Suggested/ });
    suggested.focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("radio", { name: /Keep everything for now/ })).toBeChecked();
  });

  it("approves the suggestion and returns to the queue", async () => {
    const sent = captureDecisions();
    const { router } = renderRoute("/review/delta");

    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/review"));
    expect(sent).toEqual([{ id: "delta", decision: "approved" }]);
  });

  it("keeps the sender", async () => {
    const sent = captureDecisions();
    const { router } = renderRoute("/review/delta");

    await userEvent.click(await screen.findByRole("radio", { name: /Keep everything for now/ }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/review"));
    expect(sent).toEqual([{ id: "delta", decision: "kept" }]);
  });

  it("protects the sender in rules, then keeps it", async () => {
    const calls: string[] = [];
    let savedSenders: string[] = [];
    server.use(
      http.put("*/api/rules", async ({ request }) => {
        const rules = (await request.json()) as { protectedSenders: string[] };
        calls.push("rules");
        savedSenders = rules.protectedSenders;
        return HttpResponse.json(rules);
      }),
      http.post("*/api/review/:id/decision", async ({ request }) => {
        const { decision } = (await request.json()) as { decision: string };
        calls.push(decision);
        return HttpResponse.json({ ...delta, decision });
      }),
    );
    const { router } = renderRoute("/review/delta");

    await userEvent.click(await screen.findByRole("radio", { name: /Always protect this sender/ }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/review"));
    expect(calls).toEqual(["rules", "kept"]);
    expect(savedSenders).toContain("news@e.delta.com");
  });

  it("shows the error and stays on the page when the decision fails", async () => {
    server.use(
      http.post("*/api/review/:id/decision", () =>
        HttpResponse.json({ error: "Connect your Gmail account first" }, { status: 409 }),
      ),
    );
    const { router } = renderRoute("/review/delta");

    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connect your Gmail account first");
    expect(router.state.location.pathname).toBe("/review/delta");
  });

  it("shows an empty state when there are no recent emails", async () => {
    renderRoute("/review/pragmatic");

    expect(await screen.findByText("No recent emails to show yet.")).toBeInTheDocument();
  });

  it("links to the sender's mail in Gmail", async () => {
    renderRoute("/review/delta");

    expect(await screen.findByRole("link", { name: "Open all in Gmail ↗" })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#search/from%3Anews%40e.delta.com",
    );
  });
});
