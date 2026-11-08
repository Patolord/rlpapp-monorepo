import { Linking } from "react-native";

/** Endereço do sistema web (as mesmas páginas de política, suporte e exclusão de conta). */
export const WEB_URL = "https://app.rlpeng.com.br";
export const SUPPORT_EMAIL = "rlpeng@rlpeng.com.br";

export const LINKS = {
  privacy: `${WEB_URL}/politica-privacidade`,
  support: `${WEB_URL}/suporte`,
  deleteAccount: `${WEB_URL}/excluir-conta`,
} as const;

export function openUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}
