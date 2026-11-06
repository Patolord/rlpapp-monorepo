import { httpRouter } from "convex/server";
import { registerClerkWebhookRoutes } from "./gateway/clerkWebhook";
import { registerProtectedFileRoutes } from "./gateway/protectedFiles";
import { registerServiceTokenRoutes } from "./gateway/serviceTokens";
import { registerTakeoffAuthRoutes } from "./gateway/takeoffAuth";
import { registerApiV1Routes } from "./gateway/v1";

// Só registra rotas; cada grupo de endpoints mora em gateway/.
const http = httpRouter();

// API HTTP para agentes (`/api/v1/*` e `/.well-known/jwks.json`).
registerApiV1Routes(http);
registerTakeoffAuthRoutes(http);
registerServiceTokenRoutes(http);
registerProtectedFileRoutes(http);
registerClerkWebhookRoutes(http);

export default http;
