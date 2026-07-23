// Minimal email/password session auth. Sessions are random tokens stored in
// the DB and carried in an httpOnly cookie. Users are provisioned (seed
// script / admin), not self-signup — see README.

import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { db } from "./db";

const SESSION_COOKIE = "jarvis_session";
const SESSION_TTL_DAYS = 30;

function cookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // SameSite=None (prod only, requires Secure) so the session survives
    // inside a cross-origin GHL iframe on /embed. Lax in local dev (no TLS).
    sameSite: prod ? ("none" as const) : ("lax" as const),
    secure: prod,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Issue a session for an already-authenticated user and set the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());
}

export async function signIn(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    // Constant-ish time: still burn a bcrypt compare on unknown emails.
    await bcrypt.compare(password, "$2a$12$000000000000000000000uGyEpAgg7Iyu36fMcnUJdJDbrCTBnJK6");
    return null;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  await createSession(user.id);
  return user;
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return session.user;
}
