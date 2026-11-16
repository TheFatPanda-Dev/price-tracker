import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: ts("created_at").notNull().default(now),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invites = sqliteTable("invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().default(now),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
});

export const userSettings = sqliteTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  checkIntervalHours: integer("check_interval_hours").notNull().default(6),
  notifyEmail: integer("notify_email", { mode: "boolean" }).notNull().default(false),
  emailAddress: text("email_address"),
  notifyTelegram: integer("notify_telegram", { mode: "boolean" }).notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  telegramLinkToken: text("telegram_link_token"),
  notifyOn: text("notify_on", { enum: ["any", "drops"] }).notNull().default("any"),
  minChangePercent: real("min_change_percent").notNull().default(0),
  lastSeenAt: ts("last_seen_at"),
});

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    imageUrl: text("image_url"),
    shop: text("shop").notNull(),
    currency: text("currency"),
    currentPriceCents: integer("current_price_cents"),
    previousPriceCents: integer("previous_price_cents"),
    lastChangePercent: real("last_change_percent"),
    lastChangedAt: ts("last_changed_at"),
    lowestCents: integer("lowest_cents"),
    highestCents: integer("highest_cents"),
    targetPriceCents: integer("target_price_cents"),
    targetHitAt: ts("target_hit_at"),
    inStock: integer("in_stock", { mode: "boolean" }),
    selector: text("selector"),
    method: text("method", { enum: ["static", "browser", "selector"] }),
    status: text("status", { enum: ["pending", "ok", "error"] }).notNull().default("pending"),
    lastError: text("last_error"),
    candidatesJson: text("candidates_json"),
    failCount: integer("fail_count").notNull().default(0),
    lastCheckedAt: ts("last_checked_at"),
    nextCheckAt: ts("next_check_at"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("products_user_url_idx").on(t.userId, t.url),
    index("products_next_check_idx").on(t.nextCheckAt),
  ],
);

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    previousPriceCents: integer("previous_price_cents"),
    changePercent: real("change_percent"),
    recordedAt: ts("recorded_at").notNull().default(now),
  },
  (t) => [index("price_history_product_idx").on(t.productId, t.recordedAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["drop", "rise", "target", "error"] }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    priceCents: integer("price_cents"),
    previousPriceCents: integer("previous_price_cents"),
    changePercent: real("change_percent"),
    createdAt: ts("created_at").notNull().default(now),
    readAt: ts("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
