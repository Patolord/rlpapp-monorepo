"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { departments, userRoles } from "./schema";

type ClerkCreateUserResponse = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string }>;
};

type ClerkErrorResponse = {
  errors: Array<{ message: string; long_message: string; code: string }>;
};

async function createClerkUser(args: {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY não configurado");
  }

  const body: Record<string, unknown> = {
    username: args.username,
    password: args.password,
    first_name: args.firstName,
    last_name: args.lastName,
    skip_password_checks: false,
  };

  const response = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as ClerkErrorResponse;
    const msg =
      errorData.errors?.[0]?.long_message ??
      errorData.errors?.[0]?.message ??
      `Clerk API error (${response.status})`;
    throw new Error(msg);
  }

  const user = (await response.json()) as ClerkCreateUserResponse;
  return user.id;
}

const ADMIN_ROLES = ["director", "admin"];

export const adminCreateUser = action({
  args: {
    name: v.string(),
    username: v.string(),
    password: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: userRoles,
    department: v.optional(departments),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const caller = await ctx.runQuery(internal.users.getCallerRole, {});
    if (!caller || !ADMIN_ROLES.includes(caller.role)) {
      throw new Error("Insufficient permissions");
    }

    const nameParts = args.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? args.name;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;

    const clerkId = await createClerkUser({
      username: args.username,
      password: args.password,
      firstName,
      lastName,
    });

    const userId: Id<"users"> = await ctx.runMutation(internal.users.createWithClerkId, {
      clerkId,
      name: args.name,
      email: args.email,
      username: args.username,
      role: args.role,
      department: args.department,
      phone: args.phone,
    });

    return userId;
  },
});
