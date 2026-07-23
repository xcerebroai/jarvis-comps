// Mint one-time invite codes. Send one to a client after their GHL invoice
// clears; they redeem it at /signup to create their own account.
// Usage: npm run invite:create -- [count]

import { PrismaClient } from "@prisma/client";
import { generateInviteCode } from "../src/lib/invites";

const db = new PrismaClient();

async function main() {
  const raw = process.argv[2] ?? "1";
  const count = Number.parseInt(raw, 10);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    console.error("Usage: npm run invite:create -- [count]   (1-100)");
    process.exit(1);
  }

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Retry on the astronomically unlikely collision with an existing code.
    for (let attempt = 0; ; attempt++) {
      const code = generateInviteCode();
      try {
        await db.inviteCode.create({ data: { code } });
        codes.push(code);
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
      }
    }
  }

  console.log(`\n✔ Generated ${codes.length} invite code(s):\n`);
  for (const code of codes) console.log(`   ${code}`);
  console.log("\nEach is single-use. Redeem at /signup.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
