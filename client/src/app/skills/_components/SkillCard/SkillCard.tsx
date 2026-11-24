/* SkillCard — name, type badge, tags, trusted mark, enabled toggle, agent count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, skillTypeBg } from "@/lib/skill-meta";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)} data-testid="skill-card">
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {skill.trusted ? (
          <span style={s.trusted} title={t("card.trusted")} aria-label={t("card.trusted")}>
            <Icon.CheckCircle size={14} />
          </span>
        ) : (
          <span style={s.untrusted} title={t("preview.untrustedBadge")} aria-label={t("preview.untrustedBadge")}>
            <Icon.AlertTriangle size={14} />
          </span>
        )}
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={color} bg={skillTypeBg(skill.type)}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        {!skill.trusted && (
          <Badge color="var(--warn)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
        {skill.tags.map((tag) => (
          <span key={tag} style={s.tag}>
            #{tag}
          </span>
        ))}
      </div>
      <div style={s.footer}>{t("card.agentCount", { count: skill.agent_count })}</div>
    </div>
  );
}
