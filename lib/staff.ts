import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addSession, deleteSession, getSession } from "@/lib/store";

export const STAFF_COOKIE = "clearpay_staff";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function configuredCode(): string | undefined {
  const code = process.env.STAFF_ACCESS_CODE?.trim();
  return code || undefined;
}

export function staffAccessConfigured(): boolean {
  return configuredCode() !== undefined;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyStaffCode(code: unknown): boolean {
  const expected = configuredCode();
  if (!expected || typeof code !== "string" || code.length === 0) return false;
  const a = digest(code);
  const b = digest(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createStaffSession(): { token: string; maxAgeMs: number } {
  const token = randomBytes(32).toString("hex");
  addSession({ token, createdAt: new Date().toISOString() });
  return { token, maxAgeMs: SESSION_MAX_AGE_MS };
}

export function staffSessionFrom(request: Request): string | undefined {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === STAFF_COOKIE && rest.length > 0) return rest.join("=");
  }
  return undefined;
}

export function staffSessionValid(request: Request): boolean {
  const token = staffSessionFrom(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const session = getSession(token);
  if (!session) return false;
  if (Date.parse(session.createdAt) + SESSION_MAX_AGE_MS < Date.now()) {
    deleteSession(token);
    return false;
  }
  return true;
}

export function endStaffSession(request: Request) {
  const token = staffSessionFrom(request);
  if (token) deleteSession(token);
}

export function staffCookie(token: string, maxAgeMs: number): string {
  return `${STAFF_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
}

export function clearStaffCookie(): string {
  return `${STAFF_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
