"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions/admin-orders";

type Props = {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  /** If set, the browser asks for confirmation before submitting. */
  confirmMessage?: string;
  className?: string;
  children: ReactNode;
};

/** A small form for one Server Action, with inline error display. */
export function ActionForm({ action, fields, confirmMessage, className, children }: Props) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
      className={className}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.error && (
        <p role="alert" className="mt-1 w-full text-xs text-error">
          {state.error}
        </p>
      )}
    </form>
  );
}

const TONES = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  neutral: "border border-border bg-surface hover:bg-muted",
  danger: "border border-border bg-surface text-error hover:border-error",
};

export function SubmitButton({ children, tone = "primary" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${TONES[tone]}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
