import { fixtures, type Rules } from "@sweep/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./render";
import { server } from "./server";

/** Records every PUT /api/rules body and echoes it back. */
function captureSaves() {
  const sent: Rules[] = [];
  server.use(
    http.put("*/api/rules", async ({ request }) => {
      const body = (await request.json()) as Rules;
      sent.push(body);
      return HttpResponse.json(body);
    }),
  );
  return sent;
}

const hints = {
  cautious:
    "Very cautious: only the most obvious junk is handled automatically. Expect a longer review queue.",
  balanced:
    "Balanced: clear-cut promos are handled automatically, anything ambiguous comes to you.",
  aggressive: "Aggressive: Sweep acts more often on its own. Check Activity regularly.",
};

const senderInput = () => screen.getByLabelText("Add a protected sender or domain");

describe("Rules & safety", () => {
  it("updates the threshold hint and value live", async () => {
    renderRoute("/rules");
    const slider = await screen.findByLabelText("Act when at least");

    fireEvent.change(slider, { target: { value: "99" } });
    expect(screen.getByText(hints.cautious)).toBeInTheDocument();
    expect(screen.getByText("99%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "95" } });
    expect(screen.getByText(hints.balanced)).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "90" } });
    expect(screen.getByText(hints.aggressive)).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("saves the threshold once, on release", async () => {
    const sent = captureSaves();
    renderRoute("/rules");
    const slider = await screen.findByLabelText("Act when at least");

    fireEvent.change(slider, { target: { value: "97" } });
    fireEvent.change(slider, { target: { value: "90" } });
    expect(sent).toHaveLength(0);
    fireEvent.pointerUp(slider);

    await screen.findByText("Saved");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.threshold).toBe(90);
  });

  it("saves a switch with every other field unchanged", async () => {
    const sent = captureSaves();
    renderRoute("/rules");

    const dryRun = await screen.findByRole("switch", { name: "Dry run" });
    expect(screen.getByRole("switch", { name: "Auto-unsubscribe" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Auto-delete" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(dryRun).toHaveAttribute("aria-checked", "false");

    await userEvent.click(dryRun);

    await waitFor(() => expect(sent).toEqual([{ ...fixtures.defaultRules, dryRun: true }]));
    await screen.findByText("Saved");
    expect(dryRun).toHaveAttribute("aria-checked", "true");
  });

  it("saves a protected category toggle", async () => {
    const sent = captureSaves();
    renderRoute("/rules");

    await screen.findByRole("heading", { name: "Always protected" });
    const labels = [
      "Receipts & orders",
      "Banks, bills & statements",
      "Travel & bookings",
      "Security & account alerts",
      "People you've emailed",
      "Starred & Important",
    ];
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((box) => box.textContent)).toEqual(labels);
    for (const box of boxes) expect(box).toHaveAttribute("aria-checked", "true");

    const travel = screen.getByRole("checkbox", { name: "Travel & bookings" });
    await userEvent.click(travel);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.protectedCategories.travel).toBe(false);
    await screen.findByText("Saved");
    expect(travel).toHaveAttribute("aria-checked", "false");
  });

  it("adds a protected sender with the button or Enter", async () => {
    const sent = captureSaves();
    renderRoute("/rules");

    await userEvent.type(
      await screen.findByLabelText("Add a protected sender or domain"),
      " Delta.com ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.protectedSenders.at(-1)).toBe("delta.com");
    expect(screen.getByText("delta.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove delta.com" })).toBeInTheDocument();
    expect(senderInput()).toHaveValue("");

    await userEvent.type(senderInput(), "dad@gmail.com{Enter}");

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.protectedSenders.slice(-2)).toEqual(["delta.com", "dad@gmail.com"]);
    expect(screen.getByRole("button", { name: "Remove dad@gmail.com" })).toBeInTheDocument();
  });

  it("removes a protected sender", async () => {
    const sent = captureSaves();
    renderRoute("/rules");

    await userEvent.click(await screen.findByRole("button", { name: "Remove yourcompany.com" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.protectedSenders).toEqual(["mom@gmail.com", "lincolnpta.org"]);
    expect(screen.queryByText("yourcompany.com")).not.toBeInTheDocument();
  });

  it.each([
    ["not an email", "Enter an email address or a domain, like name@example.com or example.com."],
    ["mom@gmail.com", "mom@gmail.com is already protected."],
  ])("rejects %j without saving", async (input, error) => {
    const sent = captureSaves();
    renderRoute("/rules");

    await userEvent.type(await screen.findByLabelText("Add a protected sender or domain"), input);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(senderInput()).toHaveAttribute("aria-invalid", "true");
    expect(senderInput()).toHaveAccessibleDescription(error);
    expect(sent).toHaveLength(0);

    await userEvent.type(senderInput(), "x");
    expect(senderInput()).not.toHaveAttribute("aria-invalid");
  });

  it("saves the schedule", async () => {
    const sent = captureSaves();
    renderRoute("/rules");

    const select = await screen.findByLabelText("Run");
    expect(select).toHaveDisplayValue("Daily at 6:00 AM");
    await userEvent.selectOptions(select, "Weekly on Sunday");

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.schedule).toBe("weekly");
  });

  it("shows the error and reverts the control when a save fails", async () => {
    server.use(
      http.put("*/api/rules", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );
    renderRoute("/rules");

    const autoDelete = await screen.findByRole("switch", { name: "Auto-delete" });
    await userEvent.click(autoDelete);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't save: boom"),
    );
    expect(autoDelete).toHaveAttribute("aria-checked", "true");
  });

  it("shows the save status", async () => {
    renderRoute("/rules");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Changes save automatically");

    await userEvent.click(screen.getByRole("switch", { name: "Auto-unsubscribe" }));

    await waitFor(() => expect(status).toHaveTextContent("Saved"));
  });
});
