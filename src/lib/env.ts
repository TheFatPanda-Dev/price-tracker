import "server-only";

export const env = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  get secureCookies() {
    return this.appUrl.startsWith("https://");
  },
  tz: process.env.TZ || "Europe/Ljubljana",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Price Tracker <alerts@example.com>",
  },
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
};
