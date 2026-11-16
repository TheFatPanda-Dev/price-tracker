"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState } from "@/app/(app)/actions";
import { FormMessage, Submit } from "@/components/form-bits";
import { fieldCls } from "@/components/field-class";

type Bound = (state: ActionState, form: FormData) => Promise<ActionState>;

function CheckButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-[6px] bg-yellow px-5 font-display text-[16px] font-bold tracking-[0.03em] text-board hover:bg-[#ffdc66] disabled:cursor-wait disabled:opacity-70"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
      {pending ? "Checking…" : "Check now"}
    </button>
  );
}

export function CheckNow({ action }: { action: () => Promise<ActionState> }) {
  const [state, run] = useActionState<ActionState, FormData>(() => action(), null);
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <CheckButton />
      <FormMessage state={state} />
    </form>
  );
}

export function EditForm({
  action,
  title,
  target,
  selector,
  vat,
  defaultVat,
  showVat,
}: {
  action: Bound;
  title: string;
  target: string;
  selector: string;
  vat: string;
  defaultVat: number;
  showVat: boolean;
}) {
  const [state, run] = useActionState(action, null);
  const field = fieldCls;
  return (
    <form action={run} className="space-y-4">
      <label className="block">
        <span className="block text-[14px] font-medium">Target price</span>
        <input name="target" defaultValue={target} inputMode="decimal" placeholder="e.g. 89,95" className={field} />
        <span className="mt-1 block text-[13px] text-muted">
          You get a highlighted alert when the price reaches it{showVat ? " (price including VAT)" : ""}. Leave empty for none.
        </span>
      </label>
      {showVat ? (
        <label className="block">
          <span className="block text-[14px] font-medium">VAT rate for this product (%)</span>
          <input name="vat" defaultValue={vat} inputMode="decimal" placeholder={`${String(defaultVat).replace(".", ",")} (your default)`} className={`${field} max-w-48`} />
          <span className="mt-1 block text-[13px] text-muted">Only for shops that charge a different VAT, e.g. outside the EU (use 0).</span>
        </label>
      ) : (
        <input type="hidden" name="vat" value={vat} />
      )}
      <label className="block">
        <span className="block text-[14px] font-medium">Name</span>
        <input name="title" defaultValue={title} className={field} />
      </label>
      <label className="block">
        <span className="block text-[14px] font-medium">Price element (CSS selector)</span>
        <input name="selector" defaultValue={selector} spellCheck={false} placeholder="automatic" className={`${field} font-mono text-[13px]`} />
        <span className="mt-1 block text-[13px] text-muted">Only needed when automatic reading picks the wrong number.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="ink" pendingText="Saving…">
          Save
        </Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteProduct({ action }: { action: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="inline-flex items-center gap-2 text-[14px] font-medium text-rise hover:underline">
        <Trash2 aria-hidden className="size-4" /> Remove from watchlist
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <span className="text-[14px]">Remove it and its price history?</span>
      <Submit variant="danger" pendingText="Removing…" className="h-9 px-4 text-[14px]">
        Remove
      </Submit>
      <button type="button" onClick={() => setArmed(false)} className="text-[14px] text-muted hover:underline">
        Keep it
      </button>
    </form>
  );
}
