/* /skills/:id — Skill editor. Left skill list + tabbed editor (Config /
   Preview / Versions). Tab state lives in ?tab=. Mirrors /agents/:id. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SKILL_TYPE_COLOR, skillTypeBg } from "@/lib/skill-meta";
import { SkillCard } from "@/components/skill-card";
import { SkillEditor, VALID_TABS } from "./_components/SkillEditor";
import { s } from "./styles";

export default function SkillEditorPage() {
  const t = useTranslations("skills");
  const tCommon = useTranslations("common");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const requested = search.get("tab") ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(requested) ? requested : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.notFound.title")}
          body={error instanceof ApiError ? error.message : t("detail.loadError")}
          onRetry={() => refetch()}
          retryLabel={tCommon("actions.retry")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <h1 style={s.sidebarTitle}>{t("page.heading")}</h1>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => router.push("/skills")}>
              {t("page.addSkill")}
            </Button>
          </div>
          <div style={s.sidebarList}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                href={`/skills/${sk.id}?tab=${tab}`}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.header}>
              <Icon.Sparkles size={18} style={{ color: SKILL_TYPE_COLOR[skill.type] }} />
              <h1 className="mono" style={s.title}>
                {skill.name}
              </h1>
              <Badge color={SKILL_TYPE_COLOR[skill.type]} bg={skillTypeBg(skill.type)}>
                {t(`listItem.type.${skill.type}`)}
              </Badge>
              <Badge mono icon="History">
                {t("preview.version", { version: skill.version })}
              </Badge>
              {skill.trusted && (
                <Badge color="var(--ok)" bg="var(--ok-bg)" icon="CheckCircle">
                  {t("card.trusted")}
                </Badge>
              )}
              {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
            </div>
            <div style={s.editor}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
