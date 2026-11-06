import { v } from "convex/values";
import {
  accessRoles,
  agentTokenKind,
  agentTokenPermission,
} from "../../schema/identity";

/** Validadores de `agentTokens.ts`. Nenhum expõe o hash do token. */

export const publicTokenValidator = v.object({
  _id: v.id("agentTokens"),
  name: v.string(),
  tokenPrefix: v.string(),
  permission: agentTokenPermission,
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  /** "device" = emitido pelo login do RLP Takeoff; ausente = token de agente. */
  kind: v.optional(agentTokenKind),
});

export const callValidator = v.object({
  _id: v.id("agentTokenCalls"),
  tokenId: v.id("agentTokens"),
  tokenName: v.union(v.string(), v.null()),
  tool: v.string(),
  functionPath: v.union(v.string(), v.null()),
  outcome: v.union(v.literal("success"), v.literal("error")),
  errorMessage: v.union(v.string(), v.null()),
  durationMs: v.number(),
  createdAt: v.number(),
});

/** Dono do token na visão administrativa. */
export const agentTokenOwnerValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  roles: v.array(accessRoles),
  isActive: v.boolean(),
});

/** Token apresentado e válido, com o dono, para o endpoint de verificação. */
export const verifiedAgentTokenValidator = v.object({
  token: v.object({
    _id: v.id("agentTokens"),
    name: v.string(),
    tokenPrefix: v.string(),
    permission: agentTokenPermission,
    expiresAt: v.union(v.number(), v.null()),
  }),
  user: v.object({
    _id: v.id("users"),
    clerkId: v.string(),
    name: v.string(),
    email: v.union(v.string(), v.null()),
    username: v.union(v.string(), v.null()),
    roles: v.array(accessRoles),
  }),
});
