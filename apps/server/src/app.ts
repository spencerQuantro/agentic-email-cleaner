import { zValidator } from "@hono/zod-validator";
import { DecisionRequest, LoginRequest, RecentEmails, Rules, type Session } from "@sweep/shared";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { createSessionAuth, type SessionAuthConfig } from "./auth/session";
import { ActionError, applyDecision, restoreActivity, undoDecision } from "./engine/actions";
import type { MailProvider } from "./engine/mail";
import type { Store } from "./store/types";

export interface AppDeps {
  store: Store;
  /** Returns the mail provider, or undefined when Gmail isn't connected yet. */
  getMail: () => Promise<MailProvider | undefined>;
  session: () => Promise<Omit<Session, "signedIn" | "authRequired">>;
  /** Triggers a cleanup run now. Undefined in demo mode. */
  runNow?: () => Promise<unknown>;
  /** Called after rules change so the scheduler can follow the new schedule. */
  onRulesChanged?: (rules: Rules) => void;
  nextRunAt: (rules: Rules) => Date | null;
  webOrigin?: string;
  /** Extra routes mounted at /auth (Google OAuth in live mode). */
  authRoutes?: Hono;
  /** Password protection. Absent means no password is configured and the app is open. */
  auth?: SessionAuthConfig;
}

export function createApp(deps: AppDeps) {
  const { store } = deps;

  const requireMail = async () => {
    const mail = await deps.getMail();
    if (!mail) throw new HTTPException(409, { message: "Connect your Gmail account first" });
    return mail;
  };

  const auth = deps.auth && createSessionAuth(deps.auth);

  /** The session as the caller sees it: signed-out callers learn nothing about the account. */
  const sessionFor = async (signedIn: boolean): Promise<Session> => {
    const session = await deps.session();
    const authRequired = !!auth;
    if (authRequired && !signedIn) {
      return { mode: session.mode, connected: false, email: null, signedIn, authRequired };
    }
    return { ...session, signedIn: true, authRequired };
  };
  const isSignedIn = async (c: Context) => !auth || (await auth.signedIn(c));

  const api = new Hono()
    .get("/health", (c) => c.json({ ok: true }))
    .get("/session", async (c) => c.json(await sessionFor(await isSignedIn(c))))
    .post("/login", zValidator("json", LoginRequest), async (c) => {
      await auth?.login(c, c.req.valid("json").password);
      return c.json(await sessionFor(true));
    })
    .post("/logout", async (c) => {
      auth?.logout(c);
      return c.json(await sessionFor(false));
    })
    .get("/summary", async (c) => {
      const [summary, rules] = await Promise.all([store.getSummary(), store.getRules()]);
      return c.json({ ...summary, nextRunAt: deps.nextRunAt(rules)?.toISOString() ?? null });
    })
    .get("/review", async (c) => c.json(await store.listReview()))
    .get("/review/:id", async (c) => {
      const item = await store.getReviewItem(c.req.param("id"));
      return item ? c.json(item) : c.json({ error: "Not found" }, 404);
    })
    .get("/review/:id/emails", async (c) => {
      const id = c.req.param("id");
      if (!(await store.getReviewItem(id))) return c.json({ error: "Not found" }, 404);
      return c.json(RecentEmails.parse(await store.listRecentEmails(id)));
    })
    .post("/review/:id/decision", zValidator("json", DecisionRequest), async (c) => {
      const { decision } = c.req.valid("json");
      const entry = await applyDecision(
        { store, mail: await requireMail() },
        c.req.param("id"),
        decision,
      );
      return c.json(entry);
    })
    .delete("/review/:id/decision", async (c) => {
      const entry = await undoDecision({ store, mail: await requireMail() }, c.req.param("id"));
      return c.json(entry);
    })
    .get("/activity", async (c) => c.json(await store.listActivity()))
    .post("/activity/:id/restore", async (c) => {
      const row = await restoreActivity({ store, mail: await requireMail() }, c.req.param("id"));
      return c.json(row);
    })
    .get("/rules", async (c) => c.json(await store.getRules()))
    .put("/rules", zValidator("json", Rules), async (c) => {
      const rules = await store.saveRules(c.req.valid("json"));
      deps.onRulesChanged?.(rules);
      return c.json(rules);
    })
    .post("/runs", async (c) => {
      if (!deps.runNow) return c.json({ error: "Runs are disabled in demo mode" }, 409);
      await requireMail();
      return c.json(await deps.runNow());
    });

  const app = new Hono();
  app.use("*", logger());
  if (deps.webOrigin) app.use("/api/*", cors({ origin: deps.webOrigin }));
  if (auth) {
    app.use("/api/*", auth.middleware);
    app.use("/auth/*", auth.middleware);
  }
  app.route("/api", api);
  if (deps.authRoutes) app.route("/auth", deps.authRoutes);

  app.onError((err, c) => {
    if (err instanceof ActionError) return c.json({ error: err.message }, err.status);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Something went wrong" }, 500);
  });

  return app;
}
