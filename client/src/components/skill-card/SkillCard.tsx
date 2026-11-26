/* SkillCard — name, type badge, tags, trusted mark, enabled toggle, agent count.
   The name is the link to `href` (keyboard / middle-click); a click anywhere
   else on the card follows it too, except on the toggle. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, skillTypeBg } from "@/lib/skill-meta";
import { s } from "./styles";

export function SkillCard({
  skill,
  href,
  active,
  onToggle,
}: {
  skill: Skill;
  href: string;
  active?: boolean;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const color = SKILL_TYPE_COLOR[skill.type];
  // Mouse convenience only — the name link is the accessible way in. Clicks on
  // the link itself or on the toggle are left to them.
  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(href);
  };
  return (
    <div onClick={onCardClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <Icon.Sparkles size={14} />
        </div>
        <Link href={href} className="mono" style={s.name} aria-current={active ? "page" : undefined}>
          {skill.name}
        </Link>
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
          <Toggle
            on={skill.enabled}
            onChange={onToggle}
            size={14}
            label={t("card.enabledToggle", { name: skill.name })}
          />
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
