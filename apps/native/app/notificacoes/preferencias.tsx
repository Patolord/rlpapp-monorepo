import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Banner, Divider, LoadingState, SectionTitle, Surface, Toggle, useToast } from "@/components/ui";
import { CATEGORY_META, PROFILE_CATEGORIES, type NotificationCategory } from "@/lib/notifications";
import { useProfile } from "@/lib/profile";
import { colors, space, type } from "@/lib/theme";

/** Preferências de notificação (ficha S14): Mais › Notificações. */
export default function PreferenciasScreen() {
  const me = useProfile();
  const toast = useToast();
  const prefs = useQuery(api.notifications.getPreferences);
  const update = useMutation(api.notifications.updatePreferences).withOptimisticUpdate((store, args) => {
    store.setQuery(api.notifications.getPreferences, {}, { pushOff: args.pushOff, quietHours: args.quietHours });
  });

  if (me === undefined || prefs === undefined) return <LoadingState />;
  const categories = me ? PROFILE_CATEGORIES[me.profile] : [];

  async function save(next: { pushOff: NotificationCategory[]; quietHours: boolean }) {
    try {
      await update(next);
    } catch {
      toast.error("Não deu para salvar. Confira a internet e tente de novo.");
    }
  }

  function toggleCategory(category: NotificationCategory, on: boolean) {
    if (!prefs) return;
    const off = new Set(prefs.pushOff);
    if (on) off.delete(category);
    else off.add(category);
    void save({ pushOff: [...off], quietHours: prefs.quietHours });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Banner
        tone="info"
        title="Avisos no celular chegam na próxima versão do app"
        detail="Por enquanto os avisos ficam no sino. As escolhas abaixo já valem quando o push for ativado."
      />

      <View style={styles.group}>
        <SectionTitle title="Receber no celular" />
        {categories.length === 0 ? (
          <Surface>
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>
              Seu perfil não recebe avisos no celular. Tudo o que for para você aparece no sino.
            </Text>
          </Surface>
        ) : (
          <Surface padded={false}>
            {categories.map((category, index) => (
              <View key={category}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <Toggle
                  label={CATEGORY_META[category].label}
                  description={CATEGORY_META[category].description}
                  value={!prefs.pushOff.includes(category)}
                  onChange={(on) => toggleCategory(category, on)}
                  style={styles.toggle}
                />
              </View>
            ))}
          </Surface>
        )}
        <Text style={styles.hint}>As chaves controlam só o aviso no celular. O sino continua mostrando tudo.</Text>
      </View>

      <View style={styles.group}>
        <SectionTitle title="Horário silencioso" />
        <Surface padded={false}>
          <Toggle
            label="Silenciar das 21h às 6h"
            description="O que chegar à noite fica no sino e o aviso sai às 6h."
            value={prefs.quietHours}
            onChange={(on) => void save({ pushOff: prefs.pushOff, quietHours: on })}
            style={styles.toggle}
          />
        </Surface>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, gap: space.xl },
  group: { gap: space.sm },
  toggle: { paddingHorizontal: space.lg, paddingVertical: space.md },
  hint: { ...type.caption, color: colors.textSecondaryOnBg, paddingHorizontal: space.xs },
});
