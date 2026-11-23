import { useAuth } from "@clerk/expo";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { CaptureCatalogItem } from "@rlpapp/shared/estoque/captureMatch";
import { useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Barcode, Camera, Factory, Hash, MapPin, Package, StickyNote, Tag, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, Chips, Field, SegmentedField, Sheet, useToast } from "@/components/ui";
import { normalizeCaptureText } from "@rlpapp/shared/estoque/captureMatch";

import { addPendingCapture, newCaptureClientId, PENDING_PREFIX, persistCapturePhoto, type CaptureItemData, type PendingCapture } from "@/lib/capture-queue";
import { getErrorMessage } from "@/lib/errors";
import { formatMaterialLabel, formatQty } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import type { CaptureCandidate } from "@/lib/use-capture-lookup";

import { CandidateRow } from "./candidate-row";

export type CaptureLocation = { projectId: string | null; name: string };

export type CaptureTarget =
  | { kind: "existing"; candidate: CaptureCandidate; code: string | null }
  | { kind: "new"; name: string; code: string | null; similar: CaptureCandidate[]; checkedOnServer: boolean };

const UNITS = ["un", "m", "kg", "cx", "pct", "rolo", "par", "l", "m²"] as const;
/**
 * O app pode achar que tem sinal (NetInfo) com o Convex ainda desconectado: a
 * mutação fica esperando. Passado esse tempo, a contagem vai para a fila; o
 * servidor ignora a repetição pelo `clientId`.
 */
const SEND_TIMEOUT_MS = 15_000;

class SendTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SendTimeoutError("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function parseQuantity(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

/**
 * Formulário do item capturado: quantidade contada (somar ou corrigir o
 * saldo), endereço no central e foto; para item novo, os dados do cadastro e
 * os parecidos para conferir antes de salvar.
 */
export function CaptureSheet({
  target,
  location,
  online,
  onClose,
  onSwitchToExisting,
  onSaved,
  onSavedOffline,
}: {
  target: CaptureTarget | null;
  location: CaptureLocation;
  online: boolean;
  onClose: () => void;
  onSwitchToExisting: (candidate: CaptureCandidate) => void;
  onSaved: () => void;
  onSavedOffline: (item: CaptureCatalogItem | null) => void;
}) {
  const toast = useToast();
  const { userId } = useAuth();
  const capture = useMutation(api.materialCaptures.capture);
  const generateUploadUrl = useMutation(api.materialCaptures.generateUploadUrl);
  const isCentral = location.projectId === null;

  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const [unit, setUnit] = useState<string>("un");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [moreDetails, setMoreDetails] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setQuantity("");
    setMode("add");
    setNotes("");
    setPhotoUri(null);
    setErrors({});
    setMoreDetails(false);
    if (target.kind === "existing") {
      setAddress(target.candidate.physicalAddress ?? "");
      setBarcode(target.code ?? "");
    } else {
      setAddress("");
      setName(target.name);
      setVariantLabel("");
      setUnit("un");
      setCategory("");
      setBarcode(target.code ?? "");
      setManufacturer("");
      setPartNumber("");
    }
  }, [target]);

  if (!target) return null;
  const existing = target.kind === "existing" ? target.candidate : null;
  const unitLabel = existing ? existing.unit : unit;
  const hasBalance = existing !== null && (existing.quantityHere ?? 0) > 0;

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error("Libere a câmera nos ajustes do celular para tirar a foto");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.5 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function buildItem(): CaptureItemData | undefined {
    if (existing) {
      // Item que só existe na fila do celular: o servidor reconhece pelos dados.
      if (existing.materialId.startsWith(PENDING_PREFIX)) {
        return { name: existing.name, variantLabel: existing.variantLabel ?? undefined, unit: existing.unit ?? undefined };
      }
      return barcode.trim() ? { name: existing.name, barcode: barcode.trim() } : undefined;
    }
    return {
      name: name.trim(),
      variantLabel: variantLabel.trim() || undefined,
      unit: unit || undefined,
      category: category.trim() || undefined,
      barcode: barcode.trim() || undefined,
      manufacturer: manufacturer.trim() || undefined,
      manufacturerPartNumber: partNumber.trim() || undefined,
    };
  }

  async function save() {
    if (!target || !userId) return;
    const nextErrors: Record<string, string> = {};
    const qty = parseQuantity(quantity);
    if (!Number.isFinite(qty) || qty < 0) nextErrors.quantity = "Informe a quantidade contada";
    if (!existing && !name.trim()) nextErrors.name = "Informe o nome do item";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const item = buildItem();
    const materialId = existing && !existing.materialId.startsWith(PENDING_PREFIX) ? existing.materialId : undefined;
    const pending: PendingCapture = {
      clientId: newCaptureClientId(),
      userId,
      projectId: location.projectId ?? undefined,
      locationName: location.name,
      materialId,
      item,
      // Quem viu os parecidos do servidor para este nome e mesmo assim cadastrou
      // confirma que é novo. Nome trocado no formulário: o servidor confere de novo.
      confirmedNew:
        target.kind === "new" &&
        target.checkedOnServer &&
        normalizeCaptureText(name) === normalizeCaptureText(target.name),
      quantityMode: mode,
      quantity: qty,
      physicalAddress: isCentral ? address.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
      photoUri: photoUri ?? undefined,
      label: existing ? formatMaterialLabel(existing.name, existing.variantLabel) : formatMaterialLabel(name.trim(), variantLabel.trim()),
      unit: unitLabel,
      capturedAt: Date.now(),
    };

    setSaving(true);
    try {
      if (online) {
        try {
          await withTimeout(sendNow(pending), SEND_TIMEOUT_MS);
          onSaved();
          return;
        } catch (err) {
          const state = await NetInfo.fetch().catch(() => null);
          const stillOnline = Boolean(state?.isConnected) && state?.isInternetReachable !== false;
          if (stillOnline && !(err instanceof SendTimeoutError)) {
            toast.error(getErrorMessage(err, "Não deu para salvar o item"));
            return;
          }
        }
      }
      await addPendingCapture({
        ...pending,
        photoUri: pending.photoUri ? persistCapturePhoto(pending.photoUri, pending.clientId) : undefined,
      });
      toast.show("Sem sinal: salvo no celular. Envia sozinho quando a conexão voltar.", "offline");
      onSavedOffline(
        existing
          ? null
          : {
              _id: `${PENDING_PREFIX}${pending.clientId}`,
              name: name.trim(),
              variantLabel: variantLabel.trim() || null,
              sku: null,
              barcode: barcode.trim() || null,
              unit: unit || null,
              category: category.trim() || null,
            }
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendNow(pending: PendingCapture) {
    const [photoId] = pending.photoUri ? await uploadPhotos(generateUploadUrl, [pending.photoUri]) : [];
    const result = await capture({
      clientId: pending.clientId,
      projectId: pending.projectId as Id<"projects"> | undefined,
      materialId: pending.materialId as Id<"materials"> | undefined,
      item: pending.item,
      confirmedNew: pending.confirmedNew,
      quantityMode: pending.quantityMode,
      quantity: pending.quantity,
      physicalAddress: pending.physicalAddress,
      notes: pending.notes,
      photoId,
      capturedAt: pending.capturedAt,
    });
    const label = formatMaterialLabel(result.name, result.variantLabel);
    const here = formatQty(result.quantityHere, result.unit);
    if (result.outcome === "matched") toast.success(`Somado em ${label}. Agora ${here} aqui.`);
    else if (result.outcome === "created") toast.success(`Item novo ${result.sku ?? ""} cadastrado: ${label}`);
    else toast.show(`Item novo ${result.sku ?? ""} em revisão: parece com outro do catálogo. Compras confere.`, "info");
  }

  const title = existing ? formatMaterialLabel(existing.name, existing.variantLabel) : "Item novo";
  const subtitle = existing
    ? [existing.sku, location.name].filter(Boolean).join(" · ")
    : `Cadastrar em ${location.name}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={<AppButton label={existing ? "Salvar contagem" : "Cadastrar item novo"} block loading={saving} onPress={() => void save()} />}
    >
      {existing?.status === "draft" ? (
        <Banner tone="info" title="Item em revisão" detail="Foi cadastrado em campo e Compras ainda vai conferir. Pode contar normalmente." />
      ) : null}

      {target.kind === "new" && target.similar.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Banner
            tone="warning"
            title="Confira: já existem itens parecidos"
            detail={
              target.checkedOnServer
                ? "Se for um destes, toque nele para contar no mesmo item. Se não for, cadastre como novo."
                : "Sem sinal: conferido na cópia do celular. Se for parecido com outro, Compras revisa depois."
            }
          />
          {target.similar.map((candidate) => (
            <CandidateRow key={candidate.materialId} candidate={candidate} onPress={() => onSwitchToExisting(candidate)} actionLabel="É este" />
          ))}
        </View>
      ) : null}

      {target.kind === "new" ? (
        <>
          <Field label="Nome do item *" icon={<Package size={24} color={colors.icon} strokeWidth={1.6} />} value={name} onChangeText={setName} error={errors.name} autoCapitalize="sentences" />
          <Field label="Variação (medida, potência, modelo)" icon={<Tag size={24} color={colors.icon} strokeWidth={1.6} />} value={variantLabel} onChangeText={setVariantLabel} placeholder='Ex.: 10A, 3/4", 220V' helper="Itens que só mudam a medida devem ter a medida aqui, não no nome." />
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: colors.text }]}>Unidade</Text>
            <Chips active={unit} onChange={setUnit} items={UNITS.map((u) => ({ key: u, label: u }))} style={{ paddingHorizontal: 0 }} />
          </View>
          <Field label="Código de barras" icon={<Barcode size={24} color={colors.icon} strokeWidth={1.6} />} value={barcode} onChangeText={setBarcode} autoCapitalize="none" autoCorrect={false} />
          {moreDetails ? (
            <>
              <Field label="Categoria" value={category} onChangeText={setCategory} placeholder="Ex.: Elétrica, Hidráulica" />
              <Field label="Fabricante" icon={<Factory size={24} color={colors.icon} strokeWidth={1.6} />} value={manufacturer} onChangeText={setManufacturer} />
              <Field label="Código do fabricante" icon={<Hash size={24} color={colors.icon} strokeWidth={1.6} />} value={partNumber} onChangeText={setPartNumber} autoCapitalize="characters" autoCorrect={false} />
            </>
          ) : (
            <AppButton label="Mais detalhes (categoria, fabricante)" variant="ghost" size="sm" onPress={() => setMoreDetails(true)} />
          )}
        </>
      ) : existing && target.code && !existing.barcode ? (
        <Banner tone="neutral" title="Código lido será gravado neste item" detail={`Da próxima vez, o código ${target.code} já abre ${existing.name}.`} />
      ) : null}

      {existing && hasBalance ? (
        <SegmentedField
          label={`Já tem ${formatQty(existing.quantityHere ?? 0, existing.unit)} aqui`}
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Somar ao saldo" },
            { value: "set", label: "Corrigir para o contado" },
          ]}
        />
      ) : null}
      <Field
        label={`${mode === "set" ? "Total contado" : "Quantidade"}${unitLabel ? ` (${unitLabel})` : ""} *`}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="0"
        error={errors.quantity}
        autoFocus={target.kind === "existing"}
      />
      {isCentral ? (
        <Field label="Endereço (prateleira, caixa)" icon={<MapPin size={24} color={colors.icon} strokeWidth={1.6} />} value={address} onChangeText={setAddress} placeholder="Ex.: B3-12" autoCapitalize="characters" />
      ) : null}

      {photoUri ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
          <Pressable onPress={() => setPhotoUri(null)} style={styles.photoRemove} accessibilityRole="button" accessibilityLabel="Remover foto" hitSlop={8}>
            <X size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        <AppButton label="Foto do item (opcional)" variant="secondary" icon={<Camera size={18} color={colors.text} />} onPress={() => void takePhoto()} />
      )}
      <Field label="Observações" icon={<StickyNote size={24} color={colors.icon} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  photoWrap: { alignSelf: "flex-start" },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  photoRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
