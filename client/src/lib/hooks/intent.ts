/* hooks/intent.ts — React Query hooks for a PR's intent: read (never calls the
   LLM), user override (PUT) and re-derive now (POST). Mutation errors are
   toasted by the global MutationCache.onError — no local toast. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse, PrIntentUpdate } from "@devdigest/shared";

const key = (prId: string | null | undefined) => ["pr-intent", prId] as const;

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

export function useUpdatePrIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PrIntentUpdate) =>
      api.put<PrIntentResponse>(`/pulls/${prId}/intent`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(prId) }),
  });
}

export function useDerivePrIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/derive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(prId) }),
  });
}
