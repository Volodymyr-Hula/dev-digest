/* hooks/smart-diff.ts — React Query hook for a PR's role-ordered file groups.
   Read only; the server never calls an LLM for it. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** Query key of a PR's smart diff; also used to invalidate it. */
export const smartDiffKey = (prId: string | null | undefined) => ["smart-diff", prId] as const;

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: smartDiffKey(prId),
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
