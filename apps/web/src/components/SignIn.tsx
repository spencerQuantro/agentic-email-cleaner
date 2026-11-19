import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { sessionQuery } from "../lib/queries";
import { Logo } from "./AppShell";

function errorMessage(error: Error) {
  if (!(error instanceof ApiError)) return error.message;
  if (error.status === 401) return "Wrong password.";
  if (error.status === 429) return "Too many attempts. Try again in a minute.";
  return error.message;
}

/**
 * Shown in place of any page while signed out. There is no design file; it
 * reuses the card, input and primary-button styles. The URL is left alone, so
 * signing in shows the page the user asked for.
 */
export function SignIn() {
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionQuery.queryKey, session);
      await Promise.all([
        queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "session" }),
        router.invalidate(),
      ]);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(password);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[360px] flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h1 className="m-0">
          <Logo />
        </h1>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm font-normal"
          />
        </label>
        {login.error && (
          <p role="alert" className="m-0 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-ink">
            {errorMessage(login.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="min-h-11 rounded-lg bg-primary font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
