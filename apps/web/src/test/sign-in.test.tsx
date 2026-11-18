import type { Session } from "@sweep/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./render";
import { server } from "./server";

const signedIn: Session = {
  mode: "demo",
  connected: true,
  email: "you@gmail.com",
  signedIn: true,
  authRequired: true,
};
const signedOut: Session = {
  mode: "demo",
  connected: false,
  email: null,
  signedIn: false,
  authRequired: true,
};

/** Serves a session that flips to signed in after a successful login, like the real server. */
function signedOutUntilLogin(login: () => Response) {
  let session = signedOut;
  server.use(
    http.get("*/api/session", () => HttpResponse.json(session)),
    http.post("*/api/login", () => {
      const res = login();
      if (res.ok) session = signedIn;
      return res;
    }),
  );
}

async function signIn(password: string) {
  await userEvent.type(await screen.findByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Sign-in gate", () => {
  it("shows the sign-in screen instead of the page when signed out", async () => {
    server.use(http.get("*/api/session", () => HttpResponse.json(signedOut)));
    renderRoute("/review");

    const input = await screen.findByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an alert for a wrong password", async () => {
    signedOutUntilLogin(() => HttpResponse.json({ error: "Wrong password." }, { status: 401 }));
    renderRoute("/review");

    await signIn("nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password.");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows an alert when rate-limited", async () => {
    signedOutUntilLogin(() =>
      HttpResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 }),
    );
    renderRoute("/review");

    await signIn("nope");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in a minute.",
    );
  });

  it("shows the requested page after signing in", async () => {
    signedOutUntilLogin(() => HttpResponse.json(signedIn));
    renderRoute("/rules");

    await signIn("hunter2");
    expect(await screen.findByLabelText("Act when at least")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("returns to the sign-in screen when a data request gets a 401", async () => {
    renderRoute("/rules");
    await screen.findByLabelText("Act when at least");

    server.use(
      http.get("*/api/review", () =>
        HttpResponse.json({ error: "Sign in to continue" }, { status: 401 }),
      ),
    );
    await userEvent.click(screen.getByRole("link", { name: /Review/ }));

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

    server.resetHandlers();
    server.use(http.post("*/api/login", () => HttpResponse.json(signedIn)));
    await signIn("hunter2");
    expect(await screen.findByRole("link", { name: /^Review/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("signs out from the sidebar", async () => {
    let loggedOut = false;
    server.use(
      http.post("*/api/logout", () => {
        loggedOut = true;
        return HttpResponse.json(signedOut);
      }),
    );
    renderRoute("/review");

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(loggedOut).toBe(true);
  });

  it("has no sign-out button when no password is configured", async () => {
    server.use(
      http.get("*/api/session", () =>
        HttpResponse.json({ ...signedIn, authRequired: false } satisfies Session),
      ),
    );
    renderRoute("/review");

    await screen.findByRole("navigation", { name: "Main" });
    await waitFor(() => expect(screen.getByText("you@gmail.com")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
