/* SkillsTab — every workspace skill as a checkbox; checked = linked to this
   agent. All checked, enabled skills are sent in full with each review,
   ordered by name. Globally disabled skills stay linked but are dimmed. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR, skillTypeBg } from "@/lib/skill-meta";
import { toggleLink, visibleSkills } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const tCommon = useTranslations("common");
  const skills = useSkills();
  const links = useAgentSkills(agent.id);
  const setLinks = useSetAgentSkills();
  const [filter, setFilter] = React.useState("");

  const linked = (links.data ?? []).map((l) => l.skill_id);
  const all = skills.data ?? [];
  const shown = visibleSkills(all, filter);

  const toggle = (id: string, on: boolean) =>
    setLinks.mutate({ agentId: agent.id, skillIds: toggleLink(linked, id, on) });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" mono>
          {t("skills.enabledCount", { linked: linked.length, total: all.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {(skills.isLoading || links.isLoading) && <Skeleton height={120} />}
      {(skills.isError || links.isError) && (
        <ErrorState
          title={tCommon("states.error")}
          body={t("skills.loadError")}
          retryLabel={tCommon("actions.retry")}
          onRetry={() => {
            skills.refetch();
            links.refetch();
          }}
        />
      )}
      {skills.data && links.data && all.length === 0 && (
        <p style={s.empty}>
          {t("skills.empty")} <Link href="/skills">{t("skills.createLink")}</Link>
        </p>
      )}
      {skills.data && links.data && (
        <div style={s.list}>
          {shown.map((sk) => {
            const on = linked.includes(sk.id);
            return (
              <div key={sk.id} style={s.row(on, sk.enabled)} data-testid="agent-skill-row">
                <Checkbox
                  checked={on}
                  onChange={(v) => !setLinks.isPending && toggle(sk.id, v)}
                  label={
                    <span className="mono" style={s.name}>
                      {sk.name}
                    </span>
                  }
                />
                <span style={s.spacer} />
                {!sk.enabled && <Badge color="var(--text-muted)">{t("skills.disabled")}</Badge>}
                <Badge color={SKILL_TYPE_COLOR[sk.type]} bg={skillTypeBg(sk.type)}>
                  {tSkills(`listItem.type.${sk.type}`)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
