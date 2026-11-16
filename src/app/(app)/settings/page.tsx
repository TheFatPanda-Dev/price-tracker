import type { Metadata } from "next";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { ChevronDown } from "lucide-react";
import { db, schema } from "@/db";
import { ActionForm, ButtonAction } from "@/components/app/settings-forms";
import { fieldCls } from "@/components/field-class";
import { Submit } from "@/components/form-bits";
import { requireUser } from "@/lib/auth/session";
import { fullDate } from "@/lib/format";
import { getSettings } from "@/lib/notify";
import { emailConfigured } from "@/lib/notify/email";
import { telegramConfigured } from "@/lib/notify/telegram";
import {
  changePasswordAction,
  confirmTelegramAction,
  connectTelegramAction,
  createInviteAction,
  disconnectTelegramAction,
  removeMemberAction,
  revokeInviteAction,
  testEmailAction,
  testTelegramAction,
  updateNotificationsAction,
  updatePricesAction,
  updateProfileAction,
  updateScheduleAction,
} from "../actions";

export const metadata: Metadata = { title: "Settings" };

const INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24];

function slots(h: number) {
  const out: string[] = [];
  for (let t = 0; t < 24; t += h) out.push(`${String(t).padStart(2, "0")}:00`);
  return out.length > 6 ? `${out.slice(0, 4).join(", ")} … every ${h} h` : out.join(", ");
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t-2 border-ink py-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="-mt-6 mb-3 inline-block bg-yellow px-2.5 py-1 font-display text-[13px] font-bold tracking-[0.1em] uppercase md:mb-2">{title}</h2>
        {note && <div className="mt-1 text-[14px] text-muted">{note}</div>}
      </div>
      <div className="max-w-xl">{children}</div>
    </section>
  );
}

function Toggle({ name, label, defaultChecked, disabled, hint }: { name: string; label: string; defaultChecked: boolean; disabled?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 size-4 disabled:opacity-40" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const s = getSettings(user.id);
  const isAdmin = user.role === "admin";
  const emailOk = emailConfigured();
  const tgOk = telegramConfigured();

  const members = isAdmin ? db.select().from(schema.users).orderBy(schema.users.createdAt).all() : [];
  const invites = isAdmin
    ? db
        .select()
        .from(schema.invites)
        .where(and(isNull(schema.invites.usedAt), gt(schema.invites.expiresAt, new Date())))
        .orderBy(desc(schema.invites.createdAt))
        .all()
    : [];
  const counts = isAdmin
    ? Object.fromEntries(
        members.map((m) => [m.id, db.$count(schema.products, eq(schema.products.userId, m.id))]),
      )
    : {};
  const productCounts: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) productCounts[Number(k)] = await v;

  return (
    <main className="on-paper flex-1 px-4 py-6 sm:px-8 lg:px-12">
      <h1 className="mb-4 font-display text-[26px] font-bold">Settings</h1>

      <Section title="Timetable" note="Checks run on fixed slots counted from midnight, like a departures board.">
        <ActionForm action={updateScheduleAction} submit="Save timetable">
          <label className="block">
            <span className="block text-[14px] font-medium">Check every</span>
            <span className="relative block">
              <select name="interval" defaultValue={s.checkIntervalHours} className={`${fieldCls} appearance-none pr-10`}>
                {INTERVALS.map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "hour" : "hours"} ({slots(h)})
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
            </span>
          </label>
          <div className="rounded-[6px] bg-board px-4 py-3 text-flap">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-board-muted uppercase">Today&apos;s departures</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-display text-[20px] font-semibold text-yellow">
              {Array.from({ length: Math.ceil(24 / s.checkIntervalHours) }, (_, i) => (
                <span key={i}>{String(i * s.checkIntervalHours).padStart(2, "0")}:00</span>
              ))}
            </p>
          </div>
        </ActionForm>
      </Section>

      <Section title="Prices" note="Shops show prices including VAT. Optionally show the amount without VAT under every price.">
        <ActionForm action={updatePricesAction} submit="Save prices">
          <Toggle name="showNetPrices" label="Show prices without VAT" defaultChecked={s.showNetPrices} />
          <label className="block">
            <span className="block text-[14px] font-medium">VAT rate (%)</span>
            <input name="vatPercent" inputMode="decimal" defaultValue={String(s.vatPercent).replace(".", ",")} className={`${fieldCls} max-w-32`} />
            <span className="mt-1 block text-[13px] text-muted">
              EU shops charge the rate of the country they deliver to (Slovenia 22 %). You can set a different rate on a single product.
            </span>
          </label>
        </ActionForm>
      </Section>

      <Section
        title="Alerts"
        note="The Activity feed always gets every announcement. Email and Telegram follow these rules; target hits always go out."
      >
        <ActionForm action={updateNotificationsAction} submit="Save alerts">
          <Toggle
            name="notifyEmail"
            label="Email"
            defaultChecked={s.notifyEmail}
            disabled={!emailOk}
            hint={emailOk ? undefined : "Not configured on the server (SMTP_HOST is empty)."}
          />
          <label className="block">
            <span className="block text-[14px] font-medium">Send emails to</span>
            <input name="emailAddress" type="email" defaultValue={s.emailAddress ?? user.email} className={fieldCls} />
          </label>
          <Toggle
            name="notifyTelegram"
            label="Telegram"
            defaultChecked={s.notifyTelegram}
            disabled={!s.telegramChatId}
            hint={s.telegramChatId ? undefined : "Connect Telegram below first."}
          />
          <fieldset>
            <legend className="text-[14px] font-medium">Tell me about</legend>
            <div className="mt-1 flex gap-5">
              <label className="flex items-center gap-2">
                <input type="radio" name="notifyOn" value="any" defaultChecked={s.notifyOn === "any"}  />
                drops and rises
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="notifyOn" value="drops" defaultChecked={s.notifyOn === "drops"}  />
                drops only
              </label>
            </div>
          </fieldset>
          <label className="block">
            <span className="block text-[14px] font-medium">Ignore changes smaller than (%)</span>
            <input name="minChangePercent" inputMode="decimal" defaultValue={String(s.minChangePercent)} className={`${fieldCls} max-w-32`} />
          </label>
        </ActionForm>
        {emailOk && (
          <div className="mt-4">
            <ButtonAction action={testEmailAction} label="Send test email" pendingText="Sending…" />
          </div>
        )}
      </Section>

      <Section title="Telegram" note={tgOk ? "Get alerts as messages from the tracker's bot." : "Not configured on the server (TELEGRAM_BOT_TOKEN is empty)."}>
        {!tgOk ? (
          <p className="text-[14px] text-muted">Ask the admin to create a bot with @BotFather and add its token to the server&apos;s .env.</p>
        ) : s.telegramChatId ? (
          <div className="flex flex-wrap items-start gap-3">
            <p className="w-full text-[15px]">
              Connected <span className="text-muted">(chat {s.telegramChatId})</span>
            </p>
            <ButtonAction action={testTelegramAction} label="Send test message" pendingText="Sending…" />
            <form action={disconnectTelegramAction}>
              <Submit variant="danger" pendingText="Disconnecting…">
                Disconnect
              </Submit>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <ButtonAction action={connectTelegramAction} label={s.telegramLinkToken ? "New connect link" : "Connect Telegram"} pendingText="Preparing…" variant="ink" />
            {s.telegramLinkToken && <ButtonAction action={confirmTelegramAction} label="I pressed Start" pendingText="Looking…" />}
          </div>
        )}
      </Section>

      <Section title="Profile">
        <ActionForm action={updateProfileAction} submit="Save profile">
          <label className="block">
            <span className="block text-[14px] font-medium">Name</span>
            <input name="name" defaultValue={user.name} required className={fieldCls} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-medium">Sign-in email</span>
            <input name="email" type="email" defaultValue={user.email} required className={fieldCls} />
          </label>
        </ActionForm>
      </Section>

      <Section title="Password">
        <ActionForm action={changePasswordAction} submit="Change password">
          <label className="block">
            <span className="block text-[14px] font-medium">Current password</span>
            <input name="current" type="password" autoComplete="current-password" required className={fieldCls} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-medium">New password</span>
            <input name="next" type="password" autoComplete="new-password" minLength={10} required className={fieldCls} />
          </label>
        </ActionForm>
      </Section>

      {isAdmin && (
        <Section title="Members" note="Accounts are invite-only. Each person has their own watchlist and alerts.">
          <ul className="divide-y divide-rule border-y border-rule">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{m.name}</span>
                  {m.role === "admin" && <span className="ml-2 text-[13px] text-muted">admin</span>}
                  <span className="block truncate text-[13px] text-muted">
                    {m.email} · {productCounts[m.id] ?? 0} products
                  </span>
                </span>
                {m.role === "member" && (
                  <form action={removeMemberAction.bind(null, m.id)}>
                    <Submit variant="danger" pendingText="Removing…" className="h-8 px-3 text-[13px]">
                      Remove
                    </Submit>
                  </form>
                )}
              </li>
            ))}
          </ul>

          <h3 className="mt-6 mb-2 font-display text-[17px] font-bold">Invite someone</h3>
          <ActionForm action={createInviteAction} submit="Create invite link" pendingText="Creating…" variant="yellow">
            <label className="block">
              <span className="block text-[14px] font-medium">Their email (optional)</span>
              <input name="email" type="email" placeholder="Locks the invite to this address" className={fieldCls} />
              {emailOk && <span className="mt-1 block text-[13px] text-muted">We&apos;ll also email them the link.</span>}
            </label>
          </ActionForm>

          {invites.length > 0 && (
            <>
              <h3 className="mt-6 mb-2 font-display text-[17px] font-bold">Open invites</h3>
              <ul className="divide-y divide-rule border-y border-rule">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-4 py-2 text-[14px]">
                    <span className="flex-1">
                      {i.email ?? "Anyone with the link"}
                      <span className="block text-[13px] text-muted">expires {fullDate(i.expiresAt)}</span>
                    </span>
                    <form action={revokeInviteAction.bind(null, i.id)}>
                      <Submit variant="ghost" pendingText="Revoking…" className="h-8 px-3 text-[13px]">
                        Revoke
                      </Submit>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </main>
  );
}
