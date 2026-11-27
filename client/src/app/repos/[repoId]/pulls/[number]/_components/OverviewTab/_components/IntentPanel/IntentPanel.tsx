/* IntentPanel — why this PR exists, as the reviewers see it: class, confidence
   (computed by the server from the sources, never by the model), summary, scope
   lists and sources. The user can edit it (PUT, stored as "user" and kept across
   new commits, flagged "stale") or re-derive it (POST). Reading never calls the
   LLM; with no intent yet the panel offers "Derive now". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntent, PrIntentUpdate } from "@devdigest/shared";
import { useDerivePrIntent, usePrIntent, useUpdatePrIntent } from "@/lib/hooks";
import { IntentEditForm } from "./_components/IntentEditForm";
import { IntentSources } from "./_components/IntentSources";
import { CONFIDENCE_COLORS } from "./constants";
import { classOptions } from "./helpers";
import { s } from "./styles";

function ScopeList({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  const t = useTranslations("prIntent");
  return (
    <details open data-testid={testId}>
      <summary style={s.scopeSummary}>{title}</summary>
      {items.length > 0 ? (
        <ul style={s.scopeList}>
          {items.map((x, i) => (
            <li key={`${i}:${x}`}>{x}</li>
          ))}
        </ul>
      ) : (
        <div style={{ ...s.muted, marginTop: 8 }}>{t("scope.none")}</div>
      )}
    </details>
  );
}

export function IntentPanel({ prId }: { prId: string | null }) {
  const t = useTranslations("prIntent");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const update = useUpdatePrIntent(prId);
  const derive = useDerivePrIntent(prId);
  const [editing, setEditing] = React.useState(false);

  const save = async (body: PrIntentUpdate): Promise<boolean> => {
    try {
      await update.mutateAsync(body);
      setEditing(false);
      return true;
    } catch {
      // The global MutationCache.onError already toasted it; keep the form open.
      return false;
    }
  };

  if (!prId) return null;

  const frame = (children: React.ReactNode) => (
    <section data-testid="intent-panel" aria-label={t("title")}>
      <SectionLabel icon="Target">{t("title")}</SectionLabel>
      {children}
    </section>
  );

  if (isLoading) return frame(<Skeleton height={96} />);

  if (isError) {
    return frame(
      <ErrorState title={t("loadError")} onRetry={() => refetch()} retryLabel={t("retry")} />,
    );
  }

  const intent: PrIntent | null = data?.intent ?? null;

  if (!intent) {
    return frame(
      <div data-testid="intent-empty" style={{ ...s.panel, ...s.empty }}>
        <span style={s.emptyText}>{t("empty.text")}</span>
        <Button size="sm" kind="primary" icon="Sparkles" loading={derive.isPending} onClick={() => derive.mutate()}>
          {t("empty.deriveNow")}
        </Button>
      </div>,
    );
  }

  const conf = CONFIDENCE_COLORS[intent.confidence];

  return frame(
    <div style={s.panel}>
      <div style={s.headerRow}>
        <span data-testid="intent-class" data-class={intent.intent_class}>
          <Badge icon="Target">{t(`class.${intent.intent_class}`)}</Badge>
        </span>
        <span data-testid="intent-confidence" data-confidence={intent.confidence}>
          <Badge dot color={conf.color} bg={conf.bg}>
            {t(`confidence.${intent.confidence}`)}
          </Badge>
        </span>
        {intent.source === "user" && (
          <span data-testid="intent-user-marker" title={t("marker.userTitle")}>
            <Badge icon="User">{t("marker.user")}</Badge>
          </span>
        )}
        {intent.stale && (
          <span data-testid="intent-stale-marker" title={t("marker.staleTitle")}>
            <Badge icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
              {t("marker.stale")}
            </Badge>
          </span>
        )}
        <span style={s.spacer} />
        {!editing && (
          <>
            <Button size="sm" kind="ghost" icon="Edit" onClick={() => setEditing(true)}>
              {t("actions.edit")}
            </Button>
            <Button
              size="sm"
              kind="ghost"
              icon="RefreshCw"
              loading={derive.isPending}
              onClick={() => derive.mutate()}
            >
              {t("actions.rederive")}
            </Button>
          </>
        )}
      </div>

      {intent.confidence === "low" && (
        <div data-testid="intent-low-notice" role="note" style={s.notice}>
          {t("lowNotice")}
        </div>
      )}

      {editing ? (
        <IntentEditForm
          intent={intent}
          classOptions={classOptions((c) => t(`class.${c}`))}
          pending={update.isPending}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p data-testid="intent-summary" style={s.summary}>
            {intent.intent}
          </p>
          {intent.rationale && (
            <div style={s.rationale}>
              <strong>{t("rationale")}:</strong> {intent.rationale}
            </div>
          )}
          <div style={s.scopeGrid}>
            <ScopeList title={t("scope.in")} items={intent.in_scope} testId="intent-in-scope" />
            <ScopeList title={t("scope.out")} items={intent.out_of_scope} testId="intent-out-of-scope" />
          </div>
        </>
      )}

      <div>
        <div style={{ ...s.muted, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>
          {t("sources.title")}
        </div>
        <IntentSources sources={intent.sources} />
      </div>

      {intent.source === "model" && intent.model && (
        <div style={s.muted}>{t("meta.derivedBy", { model: intent.model })}</div>
      )}
    </div>,
  );
}
