/* hooks/conventions.ts — React Query hooks for repo conventions: the list (+ scan
   state, polled while a scan runs), starting a scan, accept/reject/edit, and
   marking conventions as part of a newly created skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AttachConventionsInput,
  ConventionCandidate,
  ConventionsResponse,
  UpdateConventionInput,
} from "@devdigest/shared";

/** How often the list is refetched while a scan is queued/running. */
export const CONVENTIONS_POLL_MS = 2000;

const key = (repoId: string) => ["conventions", repoId] as const;

export function isScanActive(data: ConventionsResponse | undefined): boolean {
  return data?.scan?.status === "queued" || data?.scan?.status === "running";
}

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (q) => (isScanActive(q.state.data) ? CONVENTIONS_POLL_MS : false),
  });
}

export function useStartConventionsScan(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ jobId: string }>(`/repos/${repoId}/conventions/scan`),
    onSettled: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionInput }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

export function useAttachConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttachConventionsInput) =>
      api.post<{ attached: number }>(`/repos/${repoId}/conventions/attach`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}
