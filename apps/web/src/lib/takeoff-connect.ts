/**
 * Parâmetros da página /takeoff/conectar, enviados pelo RLP Takeoff (desktop)
 * ao abrir o navegador. Tudo vem da URL, então é validado antes de qualquer
 * redirecionamento: o navegador só volta para o listener local do app
 * (`http://127.0.0.1:<porta>/callback`), nunca para outro host.
 */
export interface ConnectParams {
  port: number;
  state: string;
  /** Desafio PKCE S256 (base64url, 43 caracteres). */
  challenge: string;
  /** Nome do computador, mostrado na confirmação e no token criado. */
  device: string;
}

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_DEVICE_LENGTH = 60;

export function parseConnectParams(search: {
  port?: string;
  state?: string;
  challenge?: string;
  device?: string;
}): ConnectParams | null {
  const portText = search.port?.trim() ?? "";
  if (!/^\d{1,5}$/.test(portText)) return null;
  const port = Number(portText);
  // portas efêmeras: o app sempre pede uma porta livre ao sistema
  if (port < 1024 || port > 65535) return null;
  const state = search.state ?? "";
  const challenge = search.challenge ?? "";
  if (!STATE_PATTERN.test(state) || !CHALLENGE_PATTERN.test(challenge)) return null;
  const device =
    (search.device ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_DEVICE_LENGTH)
      .trim() || "computador";
  return { port, state, challenge, device };
}

/** Para onde o navegador volta: o listener local do app, com o código ou o erro. */
export function takeoffCallbackUrl(
  params: Pick<ConnectParams, "port" | "state">,
  result: { code: string } | { error: string }
): string {
  const url = new URL(`http://127.0.0.1:${params.port}/callback`);
  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);
  url.searchParams.set("state", params.state);
  return url.toString();
}
