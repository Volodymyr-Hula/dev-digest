/* VersionsTab — immutable version history. Pick a version to view its snapshot;
   "Make active" switches which version linked agents receive (no new version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useActivateSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_COLOR, skillTypeBg } from "@/lib/skill-meta";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const activate = useActivateSkillVersion();
  const [selected, setSelected] = React.useState<number | null>(null);

  const current = versions?.find((v) => v.version === (selected ?? skill.version)) ?? versions?.[0];
  const latest = versions?.[0]?.version;

  const makeActive = (version: number) => {
    if (!window.confirm(t("versions.activateConfirm", { version }))) return;
    activate.mutate(
      { id: skill.id, version },
      { onSuccess: () => toast.success(t("versions.activatedToast", { version })) },
    );
  };

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>
      {isLoading && <Skeleton height={160} />}
      {isError && (
        <ErrorState
          title={tCommon("states.error")}
          body={t("versions.loadError")}
          onRetry={() => refetch()}
          retryLabel={tCommon("actions.retry")}
        />
      )}
      {versions && current && (
        <div style={s.layout}>
          <ul style={s.list}>
            {versions.map((v) => (
              <li key={v.version} style={s.listItem}>
              <button
                type="button"
                aria-current={v.version === current.version || undefined}
                style={s.item(v.version === current.version)}
                onClick={() => setSelected(v.version)}
              >
                <div style={s.itemTop}>
                  <span className="mono">{t("preview.version", { version: v.version })}</span>
                  {v.version === skill.version && <Badge color="var(--ok)">{t("versions.active")}</Badge>}
                  {v.version === latest && <Badge color="var(--accent)">{t("versions.latest")}</Badge>}
                </div>
                <div style={s.itemDate}>{new Date(v.created_at).toLocaleString()}</div>
              </button>
              </li>
            ))}
          </ul>
          <section style={s.detail} aria-label={t("preview.version", { version: current.version })}>
            <div style={s.meta}>
              <span className="mono" style={s.versionName}>
                {current.name}
              </span>
              <Badge color={SKILL_TYPE_COLOR[current.type]} bg={skillTypeBg(current.type)}>
                {t(`listItem.type.${current.type}`)}
              </Badge>
              <Badge color={current.trusted ? "var(--ok)" : "var(--warn)"}>
                {current.trusted ? t("versions.trusted") : t("versions.untrusted")}
              </Badge>
              {current.tags.map((tag) => (
                <Badge key={tag}>#{tag}</Badge>
              ))}
              <span style={s.spacer} />
              {current.version !== skill.version && (
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Check"
                  onClick={() => makeActive(current.version)}
                  disabled={activate.isPending}
                >
                  {activate.isPending ? t("versions.activating") : t("versions.makeActive")}
                </Button>
              )}
            </div>
            {current.description && <div style={s.description}>{current.description}</div>}
            <div style={s.body}>
              <Markdown>{current.body}</Markdown>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
