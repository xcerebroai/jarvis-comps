// Provision a user (until Stripe-driven provisioning lands).
// Usage: npm run user:create -- <email> <password> [--admin]

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const [email, password, flag] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run user:create -- <email> <password> [--admin]");
    process.exit(1);
  }
  const isAdmin = flag === "--admin";
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, isAdmin },
    create: { email: email.toLowerCase(), passwordHash, isAdmin },
  });
  console.log(`✔ ${user.isAdmin ? "Admin" : "User"} ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
