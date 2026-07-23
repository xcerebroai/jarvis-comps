// POST /api/auth/signup — redeem an invite code and create an account.
// The code burn and the user insert share one transaction; see
// src/lib/invites.ts for the race-safety argument.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import {
  redeemInviteCode,
  RedeemError,
  validateSignupInput,
  type RedeemTx,
} from "@/lib/invites";

const schema = z.object({
  code: z.string().max(64),
  email: z.string().max(200),
  password: z.string().max(200),
  confirmPassword: z.string().max(200),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const errors = validateSignupInput(parsed.data);
  if (errors.length) {
    return NextResponse.json(
      { error: errors[0].message, field: errors[0].field },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await db.$transaction((tx) =>
      redeemInviteCode(
        tx as unknown as RedeemTx,
        parsed.data.code,
        parsed.data.email,
        passwordHash,
      ),
    );
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RedeemError) {
      // Unknown and already-used codes share one message on purpose — the
      // response must not reveal which codes exist.
      if (err.reason === "invalid_code") {
        return NextResponse.json(
          {
            error: "That invite code isn’t valid or has already been used.",
            field: "code",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          error: "An account with that email already exists. Sign in instead.",
          field: "email",
        },
        { status: 409 },
      );
    }
    console.error("signup error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
