import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import * as Location from "expo-location";
import { LocateFixed, MapPinned } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton, Chips, EmptyState, Field, LoadingState, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

type Worksite = FunctionReturnType<typeof api.timeClock.listWorksites>[number];
type Filter = "sem" | "todas";

const DEFAULT_RADIUS_METERS = 100;

/** "-23,55" ou "-23.55" → número; null se inválido. */
function parseCoordinate(value: string, limit: number): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Math.abs(n) <= limit ? n : null;
}

/** Cercas das obras: a posição e o raio em que a marcação conta como "na obra". */
export default function CercasScreen() {
  const toast = useToast();
  const worksites = useQuery(api.timeClock.listWorksites, {});
  const setProjectGeofence = useMutation(api.timeClock.setProjectGeofence);
  const [filter, setFilter] = useState<Filter>("sem");
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => (worksites ?? []).filter((w) => filter === "todas" || !w.geofence), [worksites, filter]);

  function open(worksite: Worksite) {
    setEditing(worksite);
    setLatitude(worksite.geofence ? String(worksite.geofence.latitude) : "");
    setLongitude(worksite.geofence ? String(worksite.geofence.longitude) : "");
    setRadius(String(worksite.geofence?.radiusMeters ?? DEFAULT_RADIUS_METERS));
  }

  async function fillFromMyLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        toast.error("Permita o acesso à localização para usar a posição atual.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para ler a localização."));
    } finally {
      setLocating(false);
    }
  }

  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);
  const radiusMeters = Number(radius);
  const radiusValid = Number.isFinite(radiusMeters) && radiusMeters > 0;
  const valid = lat !== null && lng !== null && radiusValid;

  async function save(remove: boolean) {
    if (!editing || (!remove && !valid)) return;
    setSaving(true);
    try {
      await setProjectGeofence({
        projectId: editing.projectId,
        geofence: remove || lat === null || lng === null ? null : { latitude: lat, longitude: lng, radiusMeters },
      });
      toast.success(remove ? "Cerca removida" : "Cerca salva");
      setEditing(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  if (worksites === undefined) return <LoadingState />;
  const withoutFence = worksites.filter((w) => !w.geofence).length;

  return (
    <View style={styles.screen}>
      <Chips<Filter>
        items={[
          { key: "sem", label: "Sem cerca", count: withoutFence },
          { key: "todas", label: "Todas" },
        ]}
        active={filter}
        onChange={setFilter}
        style={{ paddingHorizontal: space.screen, paddingTop: space.lg }}
      />
      <FlatList
        data={list}
        keyExtractor={(w) => w.projectId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Surface onPress={() => open(item)} accessibilityLabel={`${item.name}, ${item.geofence ? "com cerca" : "sem cerca"}`}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.geofence ? `Raio de ${Math.round(item.geofence.radiusMeters)} m` : (item.address ?? "Sem endereço")}
                </Text>
              </View>
              {item.geofence ? <Pill label="Com cerca" tone="success" /> : <Pill label="Sem cerca" tone="warning" />}
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<MapPinned size={28} color={colors.primary} />}
            title={filter === "sem" ? "Todas as obras têm cerca" : "Nenhuma obra ativa"}
            description="A cerca é a área da obra em que a marcação de ponto conta como presença nela."
          />
        }
      />

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        subtitle="Cerca do ponto"
        footer={
          <View style={{ gap: space.sm }}>
            <AppButton label="Salvar cerca" block disabled={!valid} loading={saving} onPress={() => void save(false)} />
            {editing?.geofence ? <AppButton label="Remover cerca" variant="danger" block disabled={saving} onPress={() => void save(true)} /> : null}
          </View>
        }
      >
        <View style={{ gap: space.md }}>
          <AppButton
            label="Usar minha localização"
            variant="secondary"
            block
            icon={<LocateFixed size={18} color={colors.text} />}
            loading={locating}
            onPress={() => void fillFromMyLocation()}
          />
          <Field label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" error={latitude && lat === null ? "Latitude inválida" : undefined} />
          <Field label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" error={longitude && lng === null ? "Longitude inválida" : undefined} />
          <Field label="Raio (metros)" value={radius} onChangeText={(v) => setRadius(v.replace(/\D/g, ""))} keyboardType="number-pad" error={radius && !radiusValid ? "Informe o raio em metros" : undefined} />
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Quem marcar o ponto dentro desta área conta como presente nesta obra.
          </Text>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
