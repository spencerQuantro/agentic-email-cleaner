import { fixtures, type ActivityRun } from "@sweep/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./render";
import { server } from "./server";

const deleteRow = {
  id: "d1",
  sender: "Wayfair",
  action: "Moved 64 to Trash",
  why: "Promotions only; no receipts found",
  decidedBy: "auto",
  confidence: 98,
  kind: "delete",
} as const;

function oneRun(row: object): ActivityRun[] {
  return [
    {
      id: "run-1",
      title: "Today, 6:00 AM",
      summary: "1 email to Trash",
      rows: [{ ...deleteRow, ...row }],
    },
  ];
}

function rowFor(sender: string) {
  return screen.getByRole("cell", { name: sender }).closest("tr")!;
}

describe("Activity", () => {
  it("renders run tables with column headers and decided-by chips", async () => {
    renderRoute("/activity");

    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    for (const run of fixtures.activityRuns) {
      expect(screen.getByRole("heading", { name: run.title })).toBeInTheDocument();
    }
    for (const name of ["Sender", "Action", "Why", "Decided by", "Undo"]) {
      expect(screen.getAllByRole("columnheader", { name })).toHaveLength(
        fixtures.activityRuns.length,
      );
    }
    expect(screen.getAllByText("Undo")[0]).toHaveClass("sr-only");
    expect(within(rowFor("Old Navy")).getByText("Auto · 99%")).toBeInTheDocument();
    expect(within(rowFor("Target Circle")).getByText("You approved")).toBeInTheDocument();
  });

  it("offers Restore on delete rows only and Resubscribe on unsubscribe rows", async () => {
    renderRoute("/activity");
    await screen.findByRole("heading", { name: "Activity" });

    const rows = fixtures.activityRuns.flatMap((run) => run.rows);
    const restorable = rows.filter((r) => r.kind === "delete" && !r.restored && !r.dryRun);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(restorable.length);
    for (const row of rows) {
      const tr = within(rowFor(row.sender));
      if (row.kind === "unsubscribe") {
        expect(tr.getByText("Resubscribe at sender")).toBeInTheDocument();
        expect(tr.queryByRole("button")).not.toBeInTheDocument();
      } else {
        expect(tr.queryByText("Resubscribe at sender")).not.toBeInTheDocument();
      }
    }
  });

  it("restores a delete row and shows the restored state from the server", async () => {
    let restored = false;
    let posted: unknown;
    server.use(
      http.get("*/api/activity", () => HttpResponse.json(oneRun({ restored }))),
      http.post("*/api/activity/:id/restore", ({ params }) => {
        posted = params.id;
        restored = true;
        return HttpResponse.json({ ...deleteRow, restored: true });
      }),
    );
    renderRoute("/activity");

    await userEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(posted).toBe("d1"));
    const tr = within(rowFor("Wayfair"));
    expect(await tr.findByText("Restored")).toBeInTheDocument();
    expect(tr.getByText("Moved 64 to Trash")).toHaveClass("line-through");
    expect(tr.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("shows a restored row as restored on first load", async () => {
    server.use(http.get("*/api/activity", () => HttpResponse.json(oneRun({ restored: true }))));
    renderRoute("/activity");

    expect(await screen.findByText("Restored")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("labels dry-run rows and offers no Restore", async () => {
    server.use(http.get("*/api/activity", () => HttpResponse.json(oneRun({ dryRun: true }))));
    renderRoute("/activity");

    expect(await screen.findByText("Dry run")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });
});
