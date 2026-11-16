"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useActionState, useState } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { FormMessage, Submit } from "@/components/form-bits";

type Act = (state: ActionState, form: FormData) => Promise<ActionState>;
type Plain = () => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submit,
  pendingText = "Saving…",
  variant = "ink",
}: {
  action: Act;
  children?: React.ReactNode;
  submit: string;
  pendingText?: string;
  variant?: "ink" | "ghost" | "yellow";
}) {
  const [state, run] = useActionState(action, null);
  return (
    <form action={run} className="space-y-4">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant={variant} pendingText={pendingText}>
          {submit}
        </Submit>
        <FormMessage state={state} />
      </div>
      {state?.link && <LinkBox link={state.link} />}
    </form>
  );
}

export function ButtonAction({ action, label, pendingText, variant = "ghost" }: { action: Plain; label: string; pendingText: string; variant?: "ghost" | "ink" | "yellow" }) {
  const [state, run] = useActionState<ActionState, FormData>(() => action(), null);
  return (
    <form action={run} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant={variant} pendingText={pendingText}>
          {label}
        </Submit>
        <FormMessage state={state} />
      </div>
      {state?.link && <LinkBox link={state.link} />}
    </form>
  );
}

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const external = link.startsWith("https://t.me/");
  return (
    <div className="flex items-center gap-2 rounded-[6px] border border-ink bg-card p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{link}</code>
      {external ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[4px] bg-ink px-3 text-[14px] font-semibold text-flap">
          Open <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          className="inline-flex h-9 items-center gap-1.5 rounded-[4px] bg-ink px-3 text-[14px] font-semibold text-flap"
        >
          <Copy aria-hidden className="size-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}
