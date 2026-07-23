// Invite-code registration logic.
//
// Access model: an admin mints one-time codes, a client redeems one to create
// their own account, and the code is burned in the same transaction as the
// user row. No code, no account.

import { randomInt } from "crypto";

/**
 * Crockford-style alphabet: no I, L, O, U, 0, or 1, so codes survive being
 * read aloud, retyped, or pasted out of an email without transcription
 * errors.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 10;

export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Codes are stored and compared in canonical form: uppercased, with spaces
 * and dashes stripped, so "abcd-efgh ij" matches "ABCDEFGHIJ".
 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedInviteCode(raw: string): boolean {
  const code = normalizeInviteCode(raw);
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((ch) => ALPHABET.includes(ch));
}

// ---------- signup input validation ----------

export const MIN_PASSWORD_LENGTH = 10;

export interface SignupInput {
  code: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type SignupField = "code" | "email" | "password" | "confirmPassword";

export interface ValidationError {
  field: SignupField;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates shape only — never whether a code exists. Existence is checked at
 * redemption time so this can run client-side without leaking which codes are
 * real.
 */
export function validateSignupInput(input: SignupInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.code.trim()) {
    errors.push({ field: "code", message: "Enter your invite code." });
  } else if (!isWellFormedInviteCode(input.code)) {
    errors.push({
      field: "code",
      message: "That doesn’t look like a valid invite code.",
    });
  }

  const email = input.email.trim();
  if (!email) {
    errors.push({ field: "email", message: "Enter your email." });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({ field: "email", message: "Enter a valid email address." });
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: "password",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  if (input.password !== input.confirmPassword) {
    errors.push({
      field: "confirmPassword",
      message: "Passwords don’t match.",
    });
  }

  return errors;
}

// ---------- redemption ----------

export type RedeemFailure = "invalid_code" | "email_taken";

export class RedeemError extends Error {
  constructor(public readonly reason: RedeemFailure) {
    super(reason);
    this.name = "RedeemError";
  }
}

/**
 * Minimal surface of the Prisma transaction client that redeemInviteCode
 * needs. Declared structurally so the logic is testable without a database.
 */
export interface RedeemTx {
  inviteCode: {
    updateMany(args: {
      where: { code: string; usedAt: null };
      data: { usedAt: Date };
    }): Promise<{ count: number }>;
    update(args: {
      where: { code: string };
      data: { usedByUserId: string };
    }): Promise<unknown>;
  };
  user: {
    findUnique(args: {
      where: { email: string };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: { email: string; passwordHash: string; entitlement: string };
    }): Promise<{ id: string; email: string }>;
  };
}

/**
 * Claim a code and create its user atomically.
 *
 * Race-safety: the claim is a conditional UPDATE guarded on `usedAt: null`,
 * which is a compare-and-swap at the row level. Two concurrent redemptions of
 * the same code serialize on that row — the loser's updateMany matches zero
 * rows and throws, rolling its transaction back. The user row and the burn
 * therefore commit together or not at all.
 *
 * Must be called inside a transaction; pass the transactional client.
 */
export async function redeemInviteCode(
  tx: RedeemTx,
  rawCode: string,
  email: string,
  passwordHash: string,
): Promise<{ id: string; email: string }> {
  const code = normalizeInviteCode(rawCode);
  const normalizedEmail = email.trim().toLowerCase();

  // Check email first so a taken email doesn't burn a good code.
  const existing = await tx.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) throw new RedeemError("email_taken");

  const claimed = await tx.inviteCode.updateMany({
    where: { code, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new RedeemError("invalid_code");

  const user = await tx.user.create({
    data: { email: normalizedEmail, passwordHash, entitlement: "active" },
  });

  await tx.inviteCode.update({
    where: { code },
    data: { usedByUserId: user.id },
  });

  return user;
}
