/* SeverityCounts — compact "⓵2 ⚠2 💡2" tally of non-dismissed findings.
   With `popover`, hovering or focusing it opens FindingsPopover. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord, SeverityCounts as Counts } from "@devdigest/shared";
import { COUNT_KEY, SEVERITIES } from "@/lib/findings";
import { FindingsPopover } from "./FindingsPopover";
import { POPOVER_CLOSE_DELAY_MS } from "./constants";
import { s } from "./styles";

export function SeverityCounts({
  counts,
  popover,
  findings,
  onOpenChange,
}: {
  counts: Counts;
  /** Enable the hover popover. */
  popover?: boolean;
  /** Popover content; undefined renders a loading line (lazy fetch). */
  findings?: FindingRecord[];
  /** Fires when the popover opens/closes — lets callers fetch lazily. */
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("prReview");
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const openRef = React.useRef(false);

  const change = (next: boolean) => {
    if (openRef.current === next) return;
    openRef.current = next;
    setOpen(next);
    onOpenChange?.(next);
  };
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    change(true);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => change(false), POPOVER_CLOSE_DELAY_MS);
  };
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const levels = SEVERITIES.filter((sev) => counts[COUNT_KEY[sev]] > 0);
  const label = SEVERITIES.map((sev) => `${counts[COUNT_KEY[sev]]} ${SEV[sev].label}`).join(", ");

  return (
    <>
      <span
        ref={ref}
        style={s.trigger}
        aria-label={t("severity.ariaLabel", { counts: label })}
        tabIndex={popover ? 0 : undefined}
        onMouseEnter={popover ? show : undefined}
        onMouseLeave={popover ? hide : undefined}
        onFocus={popover ? show : undefined}
        onBlur={popover ? hide : undefined}
        onKeyDown={popover ? (e) => e.key === "Escape" && change(false) : undefined}
      >
        {levels.map((sev) => {
          const I = Icon[SEV[sev].icon];
          return (
            <span key={sev} data-severity={sev} className="tnum" style={s.level(SEV[sev].c)}>
              <I size={13} />
              {counts[COUNT_KEY[sev]]}
            </span>
          );
        })}
      </span>
      {popover && open && ref.current && (
        <FindingsPopover anchor={ref.current} findings={findings} onMouseEnter={show} onMouseLeave={hide} />
      )}
    </>
  );
}
