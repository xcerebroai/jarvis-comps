import type { User } from "@prisma/client";

// Access control for the add-on.
//
// Billing is manual: a client buys the add-on through GHL, an admin
// provisions their user, and access is revoked by hand on churn.
// `entitlement` is set by an operator. See "Billing and access" in the
// README.
//
// This is the single checkpoint for access; everything that gates the product
// calls it.

export function hasActiveEntitlement(user: Pick<User, "entitlement">): boolean {
  return user.entitlement === "active";
}
