import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, HardHat } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, EmptyState, LoadingState, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

/** Técnicos (qr_operator) com acesso a esta obra no campo. */
export function TechniciansSheet({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: Id<"projects"> }) {
  const toast = useToast();
  const assigned = useQuery(api.projects.getAssignedTechnicians, open ? { projectId } : "skip");
  const candidates = useQuery(api.users.list, open ? { onlyActive: true, role: "qr_operator" } : "skip");
  const setTechnicians = useMutation(api.projects.setTechnicians);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      return;
    }
    if (assigned && !dirty) setSelected(new Set(assigned.map((t) => t._id)));
  }, [open, assigned, dirty]);

  function toggle(id: string) {
    setDirty(true);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await setTechnicians({ projectId, technicianIds: [...selected] as Id<"users">[] });
      toast.success("Técnicos atualizados");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Técnicos da obra"
      subtitle="Quem vê esta obra, seus documentos e estoque no app de campo."
      maxHeight={0.85}
      footer={<AppButton label={`Salvar (${selected.size})`} onPress={() => void save()} loading={saving} disabled={!dirty} />}
    >
      {candidates === undefined || assigned === undefined ? (
        <LoadingState style={{ flex: 0, paddingVertical: space.xl }} />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<HardHat size={30} color={colors.primary} strokeWidth={1.8} />}
          title="Nenhum técnico cadastrado"
          description="Crie usuários com o papel Operador QR em Usuários."
        />
      ) : (
        <Surface padded={false}>
          {candidates.map((user, index) => {
            const active = selected.has(user._id);
            return (
              <Pressable
                key={user._id}
                onPress={() => toggle(user._id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [styles.row, index > 0 && styles.border, pressed && { backgroundColor: colors.surfacePressed }]}
              >
                <View style={[styles.check, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {active ? <Check size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
                    {user.name}
                  </Text>
                  {user.username ? (
                    <Text style={[type.caption, { color: colors.textMuted }]}>@{user.username}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Surface>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
