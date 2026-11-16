import "server-only";
import crypto from "node:crypto";

export const newToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
