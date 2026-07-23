import type { User } from "@prisma/client";

// ---- Stripe seam ----------------------------------------------------------
// Subscription gating plugs in here. Today every provisioned user has
// entitlement "active". When Stripe lands:
//   1. Add stripeCustomerId / stripeSubscriptionId to the User model.
//   2. A Stripe webhook handler (customer.subscription.updated / deleted)
//      updates user.entitlement to "active" | "past_due" | "canceled".
//   3. This function stays the single source of truth — everything that
//      gates access (API routes, pages) already calls it.
// ---------------------------------------------------------------------------

export function hasActiveEntitlement(user: Pick<User, "entitlement">): boolean {
  return user.entitlement === "active";
}
