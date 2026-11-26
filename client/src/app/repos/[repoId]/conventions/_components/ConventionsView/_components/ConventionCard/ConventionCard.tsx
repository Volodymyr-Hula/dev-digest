/* ConventionCard — one extracted convention: rule, evidence (path + snippet;
   the path links to the lines on GitHub at the scanned commit), confidence, and
   Accept / Reject / inline Edit. Read-only once it is in a skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, MonoLink, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, UpdateConventionInput } from "@devdigest/shared";
import { evidenceLabel, statusBadge } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  c,
  onPatch,
  pending,
}: {
  c: ConventionCandidate;
  /** Resolves false when the change failed (the edit then stays open). */
  onPatch: (patch: UpdateConventionInput) => Promise<boolean | void> | void;
  pending?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);
  const locked = !!c.skill_id;
  const badge = statusBadge(c);

  const save = async () => {
    const rule = draft.trim();
    if (!rule) return;
    if (rule !== c.rule && (await onPatch({ rule })) === false) return;
    setEditing(false);
  };

  return (
    <div data-convention-id={c.id} style={s.card(c.status === "rejected")}>
      <div style={s.header}>
        {editing ? (
          <div style={s.rule}>
            <Textarea value={draft} onChange={setDraft} rows={3} aria-label={t("card.ruleLabel")} />
          </div>
        ) : (
          <div style={s.rule}>{c.rule}</div>
        )}
        <div style={s.meta}>
          {badge && <Badge color={badge.color}>{t(`card.${badge.key}`)}</Badge>}
          <ConfidenceNum value={c.confidence} />
        </div>
      </div>

      <div className="mono" style={s.path}>
        {c.evidence_url ? (
          <MonoLink href={c.evidence_url}>{evidenceLabel(c)}</MonoLink>
        ) : (
          evidenceLabel(c)
        )}
      </div>
      <pre className="mono" style={s.snippet}>
        {c.evidence_snippet}
      </pre>

      {!locked && (
        <div style={s.actions}>
          {editing ? (
            <>
              <Button size="sm" kind="primary" icon="Check" onClick={save} disabled={pending || !draft.trim()}>
                {t("card.save")}
              </Button>
              <Button
                size="sm"
                kind="ghost"
                onClick={() => {
                  setDraft(c.rule);
                  setEditing(false);
                }}
              >
                {t("card.cancel")}
              </Button>
            </>
          ) : (
            <>
              {c.status !== "accepted" && (
                <Button size="sm" kind="primary" icon="Check" disabled={pending} onClick={() => onPatch({ status: "accepted" })}>
                  {t("card.accept")}
                </Button>
              )}
              {c.status !== "rejected" && (
                <Button size="sm" kind="ghost" icon="X" disabled={pending} onClick={() => onPatch({ status: "rejected" })}>
                  {t("card.reject")}
                </Button>
              )}
              <span style={s.spacer} />
              {c.status !== "rejected" && (
                <Button
                  size="sm"
                  kind="ghost"
                  icon="Edit"
                  disabled={pending}
                  onClick={() => {
                    setDraft(c.rule);
                    setEditing(true);
                  }}
                >
                  {t("card.edit")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
