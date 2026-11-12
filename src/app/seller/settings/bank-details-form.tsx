"use client";

import { useActionState } from "react";
import { SRI_LANKAN_BANKS } from "@/lib/banks";
import { saveBankDetails, type BankFormState } from "./actions";

const input = "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

type Initial = { bankName: string; bankBranch: string; bankAccountName: string; bankAccountNumber: string };

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-error">{msg}</p> : null;
}

export function BankDetailsForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<BankFormState, FormData>(saveBankDetails, {});
  // After a submit, show what was sent (or saved); before that, what's on file.
  const v = { ...initial, confirmAccountNumber: initial.bankAccountNumber, ...state.values };
  const e = state.fieldErrors ?? {};
  // Re-mount the inputs whenever the server answers, so defaultValue picks up `v`.
  const formKey = JSON.stringify(state);

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      {state.error && (
        <p role="alert" className="rounded-md bg-error/10 p-3 text-sm text-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="bankName" className="mb-1 block text-sm font-medium">
          Bank name
        </label>
        <input id="bankName" name="bankName" list="sl-banks" defaultValue={v.bankName} required maxLength={100} className={input} placeholder="Commercial Bank of Ceylon" autoComplete="off" />
        <datalist id="sl-banks">
          {SRI_LANKAN_BANKS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <FieldError msg={e.bankName} />
      </div>

      <div>
        <label htmlFor="bankBranch" className="mb-1 block text-sm font-medium">
          Branch
        </label>
        <input id="bankBranch" name="bankBranch" defaultValue={v.bankBranch} required maxLength={100} className={input} placeholder="Kandy" />
        <FieldError msg={e.bankBranch} />
      </div>

      <div>
        <label htmlFor="bankAccountName" className="mb-1 block text-sm font-medium">
          Account holder name
        </label>
        <input id="bankAccountName" name="bankAccountName" defaultValue={v.bankAccountName} required maxLength={255} className={input} placeholder="As printed on your passbook" />
        <FieldError msg={e.bankAccountName} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="bankAccountNumber" className="mb-1 block text-sm font-medium">
            Account number
          </label>
          <input id="bankAccountNumber" name="bankAccountNumber" defaultValue={v.bankAccountNumber} required inputMode="numeric" maxLength={40} className={`${input} font-mono`} autoComplete="off" />
          <FieldError msg={e.bankAccountNumber} />
        </div>
        <div>
          <label htmlFor="confirmAccountNumber" className="mb-1 block text-sm font-medium">
            Confirm account number
          </label>
          <input
            id="confirmAccountNumber"
            name="confirmAccountNumber"
            defaultValue={v.confirmAccountNumber}
            required
            inputMode="numeric"
            maxLength={40}
            className={`${input} font-mono`}
            autoComplete="off"
            onPaste={(ev) => ev.preventDefault()} // make them type it twice, to catch typos
          />
          <FieldError msg={e.confirmAccountNumber} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-5">
        {state.ok && (
          <p role="status" className="text-sm text-success">
            ✓ Bank details saved
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-6 py-2.5 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save bank details"}
        </button>
      </div>
    </form>
  );
}
