"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "./form-bits";

type State = { error?: string; ok?: string } | null;

export type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  readOnly?: boolean;
  hint?: string;
};

export function AuthForm({
  action,
  fields,
  submit,
  pendingText,
  hidden,
}: {
  action: (state: State, form: FormData) => Promise<State>;
  fields: Field[];
  submit: string;
  pendingText: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-[14px] font-medium text-board-muted">{f.label}</span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={f.defaultValue}
            readOnly={f.readOnly}
            required
            className="h-12 w-full rounded-[6px] border border-board-line bg-board-2 px-4 text-[17px] text-flap placeholder:text-board-muted read-only:opacity-70 focus:border-yellow focus:outline-none"
          />
          {f.hint && <span className="mt-1 block text-[13px] text-board-muted">{f.hint}</span>}
        </label>
      ))}
      <div className="[&_p]:text-[#ff8a7f]">
        <FormMessage state={state} />
      </div>
      <Submit pendingText={pendingText} className="h-12 w-full text-[17px]">
        {submit}
      </Submit>
    </form>
  );
}
