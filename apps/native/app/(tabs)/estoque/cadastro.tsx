import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { Building2, ScanBarcode, WifiOff, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BarcodeScannerModal } from "@/components/estoque/capture/barcode-scanner-modal";
import { CandidateRow } from "@/components/estoque/capture/candidate-row";
import { CaptureSheet, type CaptureLocation, type CaptureTarget } from "@/components/estoque/capture/capture-sheet";
import { RecentCaptures, usePendingCaptures } from "@/components/estoque/capture/recent-captures";
import { AppButton, Banner, EmptyState, LoadingState, PickerField, SearchField } from "@/components/ui";
import { useCaptureCatalog } from "@/lib/capture-catalog";
import { requestCaptureSync } from "@/lib/capture-queue";
import { useCachedQuery } from "@/lib/use-cached-query";
import { formatShortDateTime, plural } from "@/lib/format";
import { colors, radius, space, tone, type } from "@/lib/theme";
import { useCaptureLookup, type CaptureCandidate } from "@/lib/use-capture-lookup";
import { useOnline } from "@/lib/use-online";

const LOCATION_KEY = "rlp-capture-location";
const CENTRAL: CaptureLocation = { projectId: null, name: "Estoque central" };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Cadastro em campo: escolher onde está, ler o código ou digitar o nome, ver
 * se o item já existe e lançar a contagem. Funciona sem sinal (fila + cópia
 * do catálogo no celular); na volta do sinal o servidor confere de novo.
 */
export default function CadastroEmCampoScreen() {
  const online = useOnline();
  const { userId } = useAuth();
  // Cópia no aparelho: a tela abre mesmo sem sinal.
  const { data: access, cacheChecked } = useCachedQuery(userId ? `inventory-access:${userId}` : null, api.inventory.getAccess, {});
  const canCapture = access?.canCapture === true;
  const { data: projects } = useCachedQuery(
    userId && canCapture ? `inventory-projects:${userId}` : null,
    api.inventory.listProjects,
    canCapture ? {} : "skip"
  );
  const { catalog, refreshing, error: catalogError, refresh, addLocal } = useCaptureCatalog(online, canCapture);
  const pending = usePendingCaptures();

  const [location, setLocation] = useState<CaptureLocation>(CENTRAL);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [target, setTarget] = useState<CaptureTarget | null>(null);
  const name = useDebounced(search, 250);
  // A conferência abaixo é do texto já assentado; enquanto a pessoa digita, não
  // dá para cadastrar novo com os parecidos de um nome anterior.
  const settled = name === search;

  useEffect(() => {
    void AsyncStorage.getItem(LOCATION_KEY)
      .then((raw) => raw && setLocation(JSON.parse(raw) as CaptureLocation))
      .catch(() => undefined);
  }, []);

  function changeLocation(next: CaptureLocation) {
    setLocation(next);
    void AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(next)).catch(() => undefined);
  }

  const lookup = useCaptureLookup({ online, projectId: location.projectId, code, name, catalog: catalog?.items ?? [] });

  const locationOptions = useMemo(() => {
    const options = [{ value: "central", label: CENTRAL.name }];
    for (const project of projects ?? []) options.push({ value: project._id, label: `Obra: ${project.name}` });
    if (location.projectId && !options.some((o) => o.value === location.projectId)) {
      options.push({ value: location.projectId, label: location.name });
    }
    return options;
  }, [projects, location]);

  function reset() {
    setSearch("");
    setCode(null);
    setTarget(null);
  }

  function openExisting(candidate: CaptureCandidate) {
    setTarget({ kind: "existing", candidate, code });
  }

  function openNew() {
    // Só com a conferência do nome atual (não da digitação anterior).
    if (!settled) return;
    setTarget({
      kind: "new",
      name: name.trim(),
      code,
      similar: lookup.similar,
      checkedOnServer: lookup.source === "server",
    });
  }

  if (access === undefined && (online || !cacheChecked)) return <LoadingState />;
  if (!canCapture) {
    return (
      <View style={styles.pad}>
        <EmptyState title="Cadastro em campo não liberado" description="Peça ao administrador a permissão “Cadastrar itens em campo”." />
      </View>
    );
  }

  const typed = search.trim().length >= 2;
  const exactBlocksNew = lookup.exact !== null && lookup.exact.reason !== "alias";
  const showNew = typed && settled && !exactBlocksNew && !lookup.loading;
  const failedCount = pending.filter((p) => p.error).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {!online ? (
          <Banner
            tone={catalog ? "warning" : "danger"}
            icon={<WifiOff size={20} color={catalog ? tone.warning.fg : tone.danger.fg} strokeWidth={2} />}
            title="Sem sinal: o celular guarda e envia depois"
            detail={
              catalog
                ? `Conferindo na cópia do catálogo (${plural(catalog.items.length, "item", "itens")}, de ${formatShortDateTime(catalog.savedAt)}).`
                : "Sem cópia do catálogo no celular: itens novos vão para revisão de Compras."
            }
          />
        ) : null}

        <PickerField
          label="Onde você está contando"
          icon={<Building2 size={24} color={colors.icon} strokeWidth={1.6} />}
          value={location.projectId ?? "central"}
          onChange={(value) => {
            if (!value || value === "central") return changeLocation(CENTRAL);
            const option = locationOptions.find((o) => o.value === value);
            changeLocation({ projectId: value, name: option?.label ?? "Obra" });
          }}
          options={locationOptions}
          searchable
          loading={projects === undefined && online}
        />

        <AppButton label="Ler código de barras" icon={<ScanBarcode size={20} color={colors.onPrimary} />} block onPress={() => setScanning(true)} />
        <SearchField value={search} onChangeText={setSearch} placeholder="Ou digite o nome, SKU ou apelido" autoCapitalize="sentences" />

        {code ? (
          <View style={styles.codeChip}>
            <Text style={[type.label, { color: colors.text, flex: 1 }]} numberOfLines={1}>Código lido: {code}</Text>
            <Pressable onPress={() => setCode(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Limpar código">
              <X size={18} color={colors.icon} />
            </Pressable>
          </View>
        ) : null}

        {lookup.exact ? (
          <View style={styles.section}>
            <Text style={[type.eyebrow, { color: colors.success }]}>Já cadastrado</Text>
            <CandidateRow candidate={lookup.exact} onPress={() => openExisting(lookup.exact!)} highlight />
          </View>
        ) : code && !lookup.loading ? (
          <Banner tone="info" title="Código ainda não cadastrado" detail="Digite o nome do item: o app mostra os parecidos antes de cadastrar, e o código fica gravado nele." />
        ) : null}

        {lookup.similar.length > 0 ? (
          <View style={styles.section}>
            <Text style={[type.eyebrow, { color: colors.textSecondaryOnBg }]}>
              {lookup.exact ? "Outros parecidos" : "Parecidos no catálogo: é algum destes?"}
            </Text>
            {lookup.similar.map((candidate) => (
              <CandidateRow key={candidate.materialId} candidate={candidate} onPress={() => openExisting(candidate)} />
            ))}
          </View>
        ) : null}

        {typed && lookup.loading && !lookup.exact && lookup.similar.length === 0 ? (
          <Text style={styles.hint}>Conferindo no catálogo…</Text>
        ) : null}
        {showNew ? (
          <AppButton
            label={`Nenhum é: cadastrar “${search.trim()}” como novo`}
            variant={lookup.similar.length > 0 ? "secondary" : "primary"}
            block
            onPress={openNew}
          />
        ) : null}

        {pending.length > 0 ? (
          <Banner
            tone={failedCount > 0 ? "danger" : "neutral"}
            title={`${plural(pending.length, "item", "itens")} na fila do celular`}
            detail={failedCount > 0 ? `${plural(failedCount, "item", "itens")} com erro no envio. Confira abaixo.` : online ? "Enviando…" : "Envia sozinho quando a conexão voltar."}
            actionLabel={online ? "Tentar de novo" : undefined}
            onAction={online ? requestCaptureSync : undefined}
          />
        ) : null}

        <RecentCaptures online={online} pending={pending} />

        <View style={styles.catalogLine}>
          <Text style={[type.caption, { color: colors.textSecondaryOnBg, flex: 1 }]}>
            {catalogError ??
              (catalog
                ? `Catálogo no celular: ${plural(catalog.items.length, "item", "itens")} · ${formatShortDateTime(catalog.savedAt)}`
                : "Catálogo ainda não baixado no celular")}
          </Text>
          {online ? <AppButton label={refreshing ? "Baixando…" : "Atualizar"} variant="ghost" size="sm" disabled={refreshing} onPress={() => void refresh()} /> : null}
        </View>
      </ScrollView>

      <BarcodeScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(value) => {
          setScanning(false);
          setCode(value);
        }}
      />
      <CaptureSheet
        target={target}
        location={location}
        online={online}
        onClose={() => setTarget(null)}
        onSwitchToExisting={openExisting}
        onSaved={reset}
        onSavedOffline={(item) => {
          if (item) addLocal(item);
          reset();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space.screen },
  list: { padding: space.screen, paddingBottom: 96, gap: space.md },
  section: { gap: space.sm },
  hint: { ...type.caption, color: colors.textSecondaryOnBg },
  codeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  catalogLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
