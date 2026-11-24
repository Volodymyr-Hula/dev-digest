/* TagInput — chips + free text. Enter / comma adds (normalized), Backspace on
   an empty input removes the last tag. After 3+ typed characters a dropdown
   lists matching existing tags (↑/↓ + Enter or click to pick, Esc closes). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { addTag, matchTags } from "./helpers";
import { s } from "./styles";

export function TagInput({
  value,
  onChange,
  suggestions = [],
  id,
  ariaLabel,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Every existing tag; filtered here by the draft. */
  suggestions?: readonly string[];
  id?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("common.tagInput");
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(true);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  const matches = open ? matchTags(draft, suggestions, value) : [];
  const showList = matches.length > 0;

  const commit = (raw: string) => {
    onChange(addTag(value, raw));
    setDraft("");
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && showList) {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(showList ? (matches[active] ?? draft) : draft);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      e.stopPropagation(); // keep an enclosing modal open
      setOpen(false);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.box}>
        {value.map((tag) => (
          <span key={tag} style={s.chip}>
            #{tag}
            <button
              type="button"
              style={s.remove}
              aria-label={t("remove", { tag })}
              onClick={() => onChange(value.filter((x) => x !== tag))}
            >
              <Icon.X size={11} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={t("placeholder")}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          style={s.input}
          onChange={(e) => {
            const v = e.target.value;
            setOpen(true);
            setActive(0);
            if (v.endsWith(",")) commit(v.slice(0, -1));
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label={t("suggestions")} style={s.list}>
          {matches.map((tag, i) => (
            <li
              key={tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              style={s.option(i === active)}
              // mousedown fires before the input's blur, which would commit the raw draft.
              onMouseDown={(e) => {
                e.preventDefault();
                commit(tag);
              }}
              onMouseEnter={() => setActive(i)}
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
