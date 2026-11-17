import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Db } from "../db/client";
import { oauthTokens } from "../db/schema";
import {
  createOAuthClient,
  GMAIL_SCOPES,
  GmailProvider,
  type GoogleOAuthConfig,
} from "../engine/gmail";
import { decrypt, encrypt } from "../lib/crypto";

export interface GoogleAuthDeps {
  db: Db;
  oauth: GoogleOAuthConfig;
  encryptionKey: string;
  webOrigin: string;
}

export function connectedAccount(db: Db) {
  return db.select().from(oauthTokens).where(eq(oauthTokens.id, 1)).get();
}

/** Builds a Gmail provider from the stored refresh token, or undefined if not connected. */
export async function gmailFromStoredToken(deps: GoogleAuthDeps) {
  const account = await connectedAccount(deps.db);
  if (!account) return undefined;
  const client = createOAuthClient(deps.oauth);
  client.setCredentials({
    refresh_token: decrypt(account.encryptedRefreshToken, deps.encryptionKey),
  });
  return new GmailProvider(client);
}

/** /auth/google → Google consent screen → /auth/google/callback → back to the app. */
export function googleAuthRoutes(deps: GoogleAuthDeps) {
  return new Hono()
    .get("/google", (c) => {
      const state = randomBytes(16).toString("hex");
      setCookie(c, "oauth_state", state, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 600,
        path: "/",
      });
      const url = createOAuthClient(deps.oauth).generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GMAIL_SCOPES,
        state,
      });
      return c.redirect(url);
    })
    .get("/google/callback", async (c) => {
      const code = c.req.query("code");
      const state = c.req.query("state");
      if (!code || !state || state !== getCookie(c, "oauth_state")) {
        return c.text("Invalid OAuth callback", 400);
      }

      const client = createOAuthClient(deps.oauth);
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token)
        return c.text("Google did not return a refresh token. Try again.", 400);
      if (!tokens.id_token) return c.text("Google did not return an ID token.", 400);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: deps.oauth.clientId,
      });
      const email = ticket.getPayload()?.email ?? "unknown";

      const row = {
        id: 1,
        email,
        encryptedRefreshToken: encrypt(tokens.refresh_token, deps.encryptionKey),
        updatedAt: new Date().toISOString(),
      };
      await deps.db
        .insert(oauthTokens)
        .values(row)
        .onConflictDoUpdate({ target: oauthTokens.id, set: row });

      return c.redirect(deps.webOrigin);
    });
}
