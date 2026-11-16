"use client";

import { useFormStatus } from "react-dom";

export function Submit({
  children,
  pendingText,
  variant = "yellow",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "yellow" | "ink" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    yellow: "bg-yellow text-board hover:bg-[#ffdc66]",
    ink: "bg-ink text-flap hover:bg-[#2a2f38]",
    ghost: "border border-rule bg-card text-ink hover:border-ink",
    danger: "border border-rise text-rise hover:bg-rise hover:text-white",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-5 font-display text-[16px] font-bold tracking-[0.03em] transition-colors disabled:cursor-wait disabled:opacity-70 ${styles} ${className}`}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role="status" className={`text-[14px] font-medium ${state.error ? "text-rise" : "text-drop"}`}>
      {state.error ?? state.ok}
    </p>
  );
}
