import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { CATEGORY_META, type NotificationCategory } from "@/lib/notifications";

const TOKEN_KEY = "push:expoToken";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushPayload = {
  notificationId: Id<"notifications">;
  target: string;
  params: Record<string, string> | null;
};

type RegisterArgs = {
  token: string;
  platform: "ios" | "android";
  deviceName?: string;
  appVersion?: string;
};

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Avisos",
    importance: Notifications.AndroidImportance.HIGH,
  });
  for (const [id, meta] of Object.entries(CATEGORY_META) as [NotificationCategory, (typeof CATEGORY_META)[NotificationCategory]][]) {
    await Notifications.setNotificationChannelAsync(id, {
      name: meta.label,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Pede permissão, obtém o token Expo e devolve null se o aparelho não puder. */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  await ensureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  const easProjectId = projectId();
  if (!easProjectId) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId });
  return token.data;
}

export async function registerAfterLogin(
  register: (args: RegisterArgs) => Promise<null>
): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await register({
      token,
      platform,
      deviceName: Device.deviceName ?? undefined,
      appVersion: Constants.expoConfig?.version,
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error("Não foi possível registrar o token de push", error);
  }
}

export async function unregisterStoredToken(
  unregister: (args: { token: string }) => Promise<null>
): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await unregister({ token });
  } catch (error) {
    console.error("Não foi possível desligar o token de push", error);
  } finally {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Lê `target` / `params` / `notificationId` do payload do Expo. */
export function parseNotificationData(data: Record<string, unknown> | undefined | null): PushPayload | null {
  if (!data) return null;
  const notificationId = typeof data.notificationId === "string" ? data.notificationId : null;
  const target = typeof data.target === "string" ? data.target : null;
  if (!notificationId || !target) return null;
  const paramsRaw = typeof data.params === "string" ? safeJson(data.params) : data.params;
  return {
    notificationId: notificationId as Id<"notifications">,
    target,
    params: asStringRecord(paramsRaw),
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
