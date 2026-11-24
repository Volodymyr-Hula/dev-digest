import React from "react";

/** Id of the inline error node for a field with `htmlFor` (link it via aria-describedby). */
export function fieldErrorId(htmlFor: string) {
  return `${htmlFor}-error`;
}

export function FormField({
  label,
  hint,
  required,
  children,
  right,
  error,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children?: React.ReactNode;
  right?: React.ReactNode;
  /** Inline validation message; replaces the hint while present. */
  error?: React.ReactNode;
  /** Id of the control — wires the label and the error node to it. */
  htmlFor?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
          {label}
          {required && <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>}
        </label>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
      </div>
      {children}
      {error ? (
        <div
          role="alert"
          id={htmlFor ? fieldErrorId(htmlFor) : undefined}
          style={{ fontSize: 12, color: "var(--crit)", marginTop: 6, lineHeight: 1.45 }}
        >
          {error}
        </div>
      ) : (
        hint && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>{hint}</div>
        )
      )}
    </div>
  );
}
