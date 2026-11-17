import { fixtures } from "@sweep/shared";
import { screen, waitFor } from "@testing-library/react";
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
});
