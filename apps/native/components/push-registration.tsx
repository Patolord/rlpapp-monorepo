import { api } from "@rlpapp/backend/convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { UNAVAILABLE_HREF, hrefForNotification } from "@/lib/notifications";
import { useProfile } from "@/lib/profile";
import { parseNotificationData, registerAfterLogin } from "@/lib/push";

/**
 * Depois do login: pede permissão, registra o token Expo no backend e abre o
 * aviso tocado (incluindo o que acordou o app).
 */
export function PushRegistration() {
  const { isAuthenticated } = useConvexAuth();
  const register = useMutation(api.notifications.registerPushToken);
  const markRead = useMutation(api.notifications.markRead);
  const me = useProfile();
  const profile = me ? me.profile : null;
  const router = useRouter();
  const pending = useRef<Notifications.NotificationResponse | null>(null);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void registerAfterLogin(register);
  }, [isAuthenticated, register]);

  useEffect(() => {
    function open(response: Notifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      if (seen.current === id) return;
      if (!profile) {
        pending.current = response;
        return;
      }
      seen.current = id;
      pending.current = null;
      const payload = parseNotificationData(
        response.notification.request.content.data as Record<string, unknown>
      );
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (payload) {
        void markRead({ notificationId: payload.notificationId }).catch(() => undefined);
      }
      const href = payload ? hrefForNotification(payload.target, payload.params, profile) : null;
      router.push(href ?? UNAVAILABLE_HREF);
    }

    if (pending.current) open(pending.current);

    const sub = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });
    return () => sub.remove();
  }, [profile, markRead, router]);

  return null;
}
