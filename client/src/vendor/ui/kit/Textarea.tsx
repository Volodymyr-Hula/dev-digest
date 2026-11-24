import React from "react";

/** REAL controlled textarea. */
export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  mono,
  invalid,
  ...rest
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  /** Red border + aria-invalid (inline validation). */
  invalid?: boolean;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={mono ? "mono" : undefined}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        width: "100%",
        resize: "vertical",
        padding: "10px 12px",
        borderRadius: 7,
        border: `1px solid ${invalid ? "var(--crit)" : "var(--border-strong)"}`,
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        fontSize: 14,
        lineHeight: 1.55,
        outline: "none",
      }}
    />
  );
}
