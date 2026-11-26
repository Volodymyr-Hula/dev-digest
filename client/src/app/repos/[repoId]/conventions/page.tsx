/* Conventions — /repos/:repoId/conventions. Scan the repo for house-rules, review
   them, and turn the accepted ones into a skill (spec: server/specs/conventions.md). */
"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
