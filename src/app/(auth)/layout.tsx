import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-board px-4 py-8 text-flap sm:px-12">
      <Brand href="/login" />
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
