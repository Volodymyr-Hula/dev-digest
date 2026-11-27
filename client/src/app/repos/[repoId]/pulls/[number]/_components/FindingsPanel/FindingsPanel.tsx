/* FindingsPanel — one review run's findings: a severity counter row (only the
   levels present), three severity filter buttons, hide-low-confidence, j/k
   navigation + FindingCard list, wiring the accept/dismiss action hook (A2).
   The counters tally exactly the cards the list can show (after
   hide-low-confidence, dismissed included), so filtering to a level always
   shows that many cards. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, Button, Badge, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { COUNT_KEY, SEVERITIES, countBySeverity } from "@/lib/findings";
import { confidentFindings, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(
    () => countBySeverity(confidentFindings(findings, hideLow), { includeDismissed: true }),
    [findings, hideLow],
  );
  const levels = SEVERITIES.filter((sev) => counts[COUNT_KEY[sev]] > 0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severityFilter),
    [findings, hideLow, severityFilter],
  );
  React.useEffect(() => setFocusIdx(0), [severityFilter, hideLow]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      {levels.length > 0 && (
        <div data-testid="severity-counts" style={s.countRow}>
          {levels.map((sev, i) => (
            <React.Fragment key={sev}>
              {i > 0 && <span style={s.countSep}>·</span>}
              <Badge icon={SEV[sev].icon} color={SEV[sev].c} bg={SEV[sev].bg}>
                <span className="tnum">{counts[COUNT_KEY[sev]]}</span> {SEV[sev].label.toUpperCase()}
              </Badge>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={s.toolbar}>
        {findings.length > 0 && (
          <div role="group" aria-label={t("severity.filterLabel")} style={s.severityBar}>
            {SEVERITIES.map((sev) => {
              const n = counts[COUNT_KEY[sev]];
              const active = severityFilter === sev;
              return (
                <span key={sev} style={n === 0 && !active ? s.chipDisabled : undefined}>
                  <Chip
                    icon={SEV[sev].icon}
                    color={SEV[sev].c}
                    active={active}
                    onClick={n === 0 && !active ? undefined : () => setSeverityFilter(active ? null : sev)}
                  >
                    {SEV[sev].label}
                  </Chip>
                </span>
              );
            })}
            {severityFilter && (
              <Button kind="ghost" size="sm" icon="X" onClick={() => setSeverityFilter(null)}>
                {t("severity.filterReset")}
              </Button>
            )}
          </div>
        )}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
