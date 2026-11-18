import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { ApiError } from "./api";
import { sessionQuery } from "./queries";

/** Query client shared by the app and tests. Any 401 signs the user out, which shows the sign-in screen. */
export function createQueryClient(config?: QueryClientConfig) {
  const onError = (error: Error) => {
    if (!(error instanceof ApiError) || error.status !== 401) return;
    queryClient.setQueryData(
      sessionQuery.queryKey,
      (session) =>
        session && {
          ...session,
          connected: false,
          email: null,
          signedIn: false,
          authRequired: true,
        },
    );
  };
  const queryClient = new QueryClient({
    ...config,
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });
  return queryClient;
}
