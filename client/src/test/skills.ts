/* Shared Skill fixtures for client tests. */
import type { Skill } from "@devdigest/shared";

export function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Rubric for PR quality",
    type: "rubric",
    source: "manual",
    body: "# PR Quality Rubric\n- correctness",
    enabled: true,
    version: 5,
    tags: ["quality"],
    trusted: true,
    agent_count: 3,
    ...over,
  };
}
