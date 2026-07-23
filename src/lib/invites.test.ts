import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  isWellFormedInviteCode,
  normalizeInviteCode,
  redeemInviteCode,
  RedeemError,
  validateSignupInput,
  type RedeemTx,
  type SignupInput,
} from "./invites";

// ---------- fake transaction ----------

interface FakeRow {
  code: string;
  usedAt: Date | null;
  usedByUserId: string | null;
}

/**
 * In-memory stand-in for the Prisma transaction client. updateMany applies
 * the same `usedAt: null` guard Postgres does, so a second claim of an
 * already-burned row matches zero rows — which is exactly how the real race
 * resolves.
 */
function fakeTx(opts: { codes?: string[]; emails?: string[] } = {}) {
  const rows: FakeRow[] = (opts.codes ?? []).map((code) => ({
    code,
    usedAt: null,
    usedByUserId: null,
  }));
  const users = new Map<string, { id: string; email: string }>();
  for (const e of opts.emails ?? []) users.set(e, { id: `pre-${e}`, email: e });
  let seq = 0;

  const tx: RedeemTx = {
    inviteCode: {
      async updateMany({ where, data }) {
        const hits = rows.filter(
          (r) => r.code === where.code && r.usedAt === null,
        );
        for (const r of hits) r.usedAt = data.usedAt;
        return { count: hits.length };
      },
      async update({ where, data }) {
        const row = rows.find((r) => r.code === where.code);
        if (row) row.usedByUserId = data.usedByUserId;
        return row;
      },
    },
    user: {
      async findUnique({ where }) {
        return users.get(where.email) ?? null;
      },
      async create({ data }) {
        const user = { id: `u${++seq}`, email: data.email };
        users.set(data.email, user);
        return user;
      },
    },
  };
  return { tx, rows, users };
}

// ---------- code generation / normalization ----------

describe("invite code generation", () => {
  it("produces 10-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(10);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{10}$/);
      expect(isWellFormedInviteCode(code)).toBe(true);
    }
  });

  it("excludes visually ambiguous characters", () => {
    const joined = Array.from({ length: 200 }, generateInviteCode).join("");
    for (const bad of ["I", "L", "O", "U", "0", "1"]) {
      expect(joined).not.toContain(bad);
    }
  });

  it("does not repeat across many draws", () => {
    const seen = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(seen.size).toBe(500);
  });
});

describe("normalizeInviteCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeInviteCode(" abcd-efgh ij ")).toBe("ABCDEFGHIJ");
  });

  it("rejects wrong length or bad characters", () => {
    expect(isWellFormedInviteCode("ABCDEFGHI")).toBe(false); // 9 chars
    expect(isWellFormedInviteCode("ABCDEFGHIJK")).toBe(false); // 11 chars
    expect(isWellFormedInviteCode("ABCDEFGHI0")).toBe(false); // banned 0
    expect(isWellFormedInviteCode("ABCDEFGHI!")).toBe(false); // symbol
    expect(isWellFormedInviteCode("")).toBe(false);
  });
});

// ---------- signup validation ----------

function input(over: Partial<SignupInput> = {}): SignupInput {
  return {
    code: "ABCDEFGHJK",
    email: "client@example.com",
    password: "averylongpassword",
    confirmPassword: "averylongpassword",
    ...over,
  };
}

describe("validateSignupInput", () => {
  it("accepts a clean signup", () => {
    expect(validateSignupInput(input())).toEqual([]);
  });

  it("requires an invite code", () => {
    const errs = validateSignupInput(input({ code: "   " }));
    expect(errs.map((e) => e.field)).toContain("code");
  });

  it("rejects a malformed code without claiming it exists", () => {
    const errs = validateSignupInput(input({ code: "not-a-code" }));
    expect(errs[0].field).toBe("code");
    expect(errs[0].message).not.toMatch(/used|exist|found/i);
  });

  it("rejects invalid emails", () => {
    for (const email of ["", "nope", "a@b", "a b@c.com"]) {
      const errs = validateSignupInput(input({ email }));
      expect(errs.some((e) => e.field === "email")).toBe(true);
    }
  });

  it("enforces the 10-character password minimum", () => {
    const errs = validateSignupInput(
      input({ password: "shortpwd", confirmPassword: "shortpwd" }),
    );
    expect(errs.some((e) => e.field === "password")).toBe(true);
    expect(validateSignupInput(input({ password: "exactly10c", confirmPassword: "exactly10c" }))).toEqual([]);
  });

  it("requires the confirmation to match", () => {
    const errs = validateSignupInput(
      input({ confirmPassword: "somethingelse" }),
    );
    expect(errs.some((e) => e.field === "confirmPassword")).toBe(true);
  });

  it("reports several problems at once", () => {
    const errs = validateSignupInput(
      input({ code: "x", email: "bad", password: "s", confirmPassword: "t" }),
    );
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------- redemption / burn ----------

describe("redeemInviteCode", () => {
  it("creates the user and burns the code", async () => {
    const { tx, rows } = fakeTx({ codes: ["ABCDEFGHJK"] });
    const user = await redeemInviteCode(
      tx,
      "ABCDEFGHJK",
      "New@Example.com",
      "hash",
    );
    expect(user.email).toBe("new@example.com");
    expect(rows[0].usedAt).toBeInstanceOf(Date);
    expect(rows[0].usedByUserId).toBe(user.id);
  });

  it("accepts a code in loose form", async () => {
    const { tx, rows } = fakeTx({ codes: ["ABCDEFGHJK"] });
    await redeemInviteCode(tx, " abcd-efgh jk ", "a@b.com", "hash");
    expect(rows[0].usedAt).not.toBeNull();
  });

  it("rejects a code that does not exist", async () => {
    const { tx } = fakeTx({ codes: ["ABCDEFGHJK"] });
    await expect(
      redeemInviteCode(tx, "ZZZZZZZZZZ", "a@b.com", "hash"),
    ).rejects.toThrow(RedeemError);
  });

  it("rejects an already-burned code", async () => {
    const { tx, rows } = fakeTx({ codes: ["ABCDEFGHJK"] });
    await redeemInviteCode(tx, "ABCDEFGHJK", "first@b.com", "hash");
    const err = await redeemInviteCode(
      tx,
      "ABCDEFGHJK",
      "second@b.com",
      "hash",
    ).catch((e) => e);
    expect(err).toBeInstanceOf(RedeemError);
    expect(err.reason).toBe("invalid_code");
    // the original owner is untouched
    expect(rows[0].usedByUserId).toBe("u1");
  });

  it("uses the same message path for unknown and used codes", async () => {
    const { tx } = fakeTx({ codes: ["ABCDEFGHJK"] });
    await redeemInviteCode(tx, "ABCDEFGHJK", "first@b.com", "hash");
    const used = await redeemInviteCode(tx, "ABCDEFGHJK", "x@b.com", "h").catch(
      (e) => e.reason,
    );
    const unknown = await redeemInviteCode(tx, "ZZZZZZZZZZ", "y@b.com", "h").catch(
      (e) => e.reason,
    );
    // identical reason -> the UI cannot leak which codes exist
    expect(used).toBe(unknown);
  });

  it("rejects a duplicate email without burning the code", async () => {
    const { tx, rows } = fakeTx({
      codes: ["ABCDEFGHJK"],
      emails: ["taken@example.com"],
    });
    const err = await redeemInviteCode(
      tx,
      "ABCDEFGHJK",
      "TAKEN@example.com",
      "hash",
    ).catch((e) => e);
    expect(err.reason).toBe("email_taken");
    expect(rows[0].usedAt).toBeNull(); // code survives for a retry
  });

  it("lets only one of two concurrent redemptions win", async () => {
    const { tx, rows, users } = fakeTx({ codes: ["ABCDEFGHJK"] });
    const results = await Promise.allSettled([
      redeemInviteCode(tx, "ABCDEFGHJK", "one@b.com", "hash"),
      redeemInviteCode(tx, "ABCDEFGHJK", "two@b.com", "hash"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.reason).toBe(
      "invalid_code",
    );
    expect(rows[0].usedAt).not.toBeNull();
    // exactly one account exists from this code
    expect(users.size).toBe(1);
  });
});
