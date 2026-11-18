import { type QueryClient, useQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  ErrorComponent,
  type ErrorComponentProps,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { SignIn } from "../components/SignIn";
import { ApiError } from "../lib/api";
import { sessionQuery } from "../lib/queries";

export interface RouterContext {
  queryClient: QueryClient;
}

/** Every page sits behind the sign-in gate when a password is configured. */
function Root() {
  const { data: session, isPending } = useQuery(sessionQuery);
  if (isPending) return null;
  if (session?.signedIn === false) return <SignIn />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** A route loader that got a 401 lands here; the query client has already marked the session signed out. */
function RootError({ error }: ErrorComponentProps) {
  if (error instanceof ApiError && error.status === 401) return <SignIn />;
  return <ErrorComponent error={error} />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  errorComponent: RootError,
  notFoundComponent: () => <p className="text-muted">Page not found.</p>,
});
