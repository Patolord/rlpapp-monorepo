// Cliente mínimo do Microsoft Graph com o token do próprio app (client
// credentials), para as actions de sharepoint.ts. fetch funciona no runtime
// padrão do Convex.

import { ConvexError } from "convex/values";
import { env } from "../../_generated/server";

export const GRAPH_URL = "https://graph.microsoft.com/v1.0";

type GraphErrorCode =
  | "SHAREPOINT_NOT_CONFIGURED"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "FILE_CHANGED"
  | "SHAREPOINT_FORBIDDEN"
  | "SHAREPOINT_BUSY"
  | "SHAREPOINT_ERROR";

export function sharepointError(code: GraphErrorCode, message: string) {
  return new ConvexError({ code, message });
}

interface Credentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

function credentials(): Credentials {
  const tenantId = env.MS_GRAPH_TENANT_ID?.trim();
  const clientId = env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = env.MS_GRAPH_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw sharepointError(
      "SHAREPOINT_NOT_CONFIGURED",
      "SharePoint não configurado neste ambiente (MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET)."
    );
  }
  return { tenantId, clientId, clientSecret };
}

// Cache por instância do runtime: o token vale ~1 h e é o mesmo para todos os
// usuários (o app acessa o SharePoint como ele mesmo; quem pode o quê é
// decidido pelas permissões arquivos.* e pelas pastas liberadas).
let cachedToken: { key: string; value: string; expiresAt: number } | null = null;

/** Só para testes: esquece o token em cache. */
export function resetGraphTokenCache(): void {
  cachedToken = null;
}

async function accessToken(creds: Credentials, forceRefresh: boolean): Promise<string> {
  const key = `${creds.tenantId}:${creds.clientId}`;
  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.key === key && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    }
  );
  if (!response.ok) {
    // A resposta do Entra pode citar o client id; não a repassa ao agente.
    console.error("SharePoint: falha ao obter token do Entra ID", response.status, await response.text());
    if (response.status === 400 || response.status === 401) {
      throw sharepointError(
        "SHAREPOINT_NOT_CONFIGURED",
        "O backend não conseguiu entrar no SharePoint (credenciais do app inválidas ou expiradas)."
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw sharepointError(
        "SHAREPOINT_BUSY",
        "O login da Microsoft está indisponível ou limitando chamadas agora; tente de novo em alguns segundos."
      );
    }
    throw sharepointError(
      "SHAREPOINT_ERROR",
      `Erro ao entrar no SharePoint (Entra ID respondeu ${response.status}).`
    );
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw sharepointError("SHAREPOINT_ERROR", "Resposta inesperada do Entra ID ao obter token.");
  }
  cachedToken = {
    key,
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

export interface GraphRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  /** Caminho a partir de /v1.0 (já codificado) ou URL absoluta do Graph. */
  path: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  /** Mensagens para 404 e 409 conforme a operação. */
  notFoundMessage?: string;
  conflictMessage?: string;
}

/** Chamada autenticada ao Graph; erros viram ConvexError com mensagem em pt-BR. */
export async function graphFetch(request: GraphRequest): Promise<Response> {
  const creds = credentials();
  const url = request.path.startsWith("https://") ? request.path : `${GRAPH_URL}${request.path}`;
  if (!url.startsWith(`${GRAPH_URL}/`)) {
    throw sharepointError("SHAREPOINT_ERROR", "Endereço do Graph inválido.");
  }
  let response: Response | null = null;
  for (const forceRefresh of [false, true]) {
    const token = await accessToken(creds, forceRefresh);
    response = await fetch(url, {
      method: request.method ?? "GET",
      headers: { ...request.headers, Authorization: `Bearer ${token}` },
      body: request.body,
    });
    // Token revogado ou rotacionado no meio do cache: tenta uma vez com um novo.
    if (response.status !== 401) break;
  }
  if (!response) throw sharepointError("SHAREPOINT_ERROR", "Sem resposta do SharePoint.");
  if (response.ok) return response;
  throw await graphError(response, request);
}

export async function graphJson<T>(request: GraphRequest): Promise<T> {
  const response = await graphFetch(request);
  return (await response.json()) as T;
}

async function graphError(response: Response, request: GraphRequest) {
  const text = await response.text();
  let graphCode = "";
  try {
    graphCode = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? "";
  } catch {
    // corpo não-JSON
  }
  switch (response.status) {
    case 404:
      return sharepointError("NOT_FOUND", request.notFoundMessage ?? "Arquivo ou pasta não encontrado.");
    case 409:
      return sharepointError(
        "ALREADY_EXISTS",
        request.conflictMessage ?? "Já existe um item com esse nome."
      );
    case 412:
      return sharepointError(
        "FILE_CHANGED",
        "O arquivo mudou no SharePoint desde a leitura (eTag diferente). Leia de novo antes de substituir."
      );
    case 401:
    case 403:
      console.error("SharePoint: acesso negado pelo Graph", response.status, graphCode, text);
      return sharepointError(
        "SHAREPOINT_FORBIDDEN",
        "O app do backend não tem acesso a esse local do SharePoint."
      );
    case 429:
    case 503:
      return sharepointError(
        "SHAREPOINT_BUSY",
        "O SharePoint está limitando as chamadas agora; tente de novo em alguns segundos."
      );
    default:
      console.error("SharePoint: erro do Graph", response.status, graphCode, text);
      return sharepointError(
        "SHAREPOINT_ERROR",
        `Erro do SharePoint (${response.status}${graphCode ? `, ${graphCode}` : ""}).`
      );
  }
}
