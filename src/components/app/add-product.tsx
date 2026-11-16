"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { addProductAction, type ActionState } from "@/app/(app)/actions";
import { Submit } from "@/components/form-bits";

export function AddProduct() {
  const [state, action] = useActionState<ActionState, FormData>(addProductAction, null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok && input.current) input.current.value = "";
  }, [state]);
  return (
    <form action={action} className="pt-1">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="product-url">
          Product link
        </label>
        <input
          ref={input}
          id="product-url"
          name="url"
          type="url"
          inputMode="url"
          required
          autoComplete="off"
          placeholder="Paste a product link from any shop"
          className="h-14 w-full min-w-0 rounded-[6px] sm:flex-1 sm:flex-1 border border-board-line bg-board-2 px-5 text-[18px] font-medium text-flap placeholder:text-board-muted/80 focus:border-yellow focus:outline-none"
        />
        <Submit pendingText="Reading price…" className="h-14 px-7 text-[17px]">
          Track price
        </Submit>
      </div>
      {(state?.ok || state?.error) && (
        <p role="status" className={`mt-3 text-[14px] font-medium ${state.ok ? "text-[#7fd6a1]" : "text-[#ff8a7f]"}`}>
          {state.ok ?? state.error}{" "}
          {state.link && (
            <Link href={state.link} className="text-flap underline underline-offset-4">
              Open
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
