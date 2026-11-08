import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { Bot, Camera, Check, History, Plus, Send, Trash2, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton, ConfirmDialog, EmptyState, IconButton, LoadingState, Sheet, Surface, useToast } from "@/components/ui";
import { describeIntent, type AiIntent } from "@/lib/ai-intents";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";

type Msg = { key: string; role: "user" | "assistant"; text: string; intents?: AiIntent[] };

/**
 * Assistente IA da obra (ficha O17): conversa, proposta de alterações e
 * aplicar só depois de Confirmar. Foto entra como opção discreta (decisão 28).
 */
export default function AssistenteScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const id = projectId as Id<"projects">;
  const toast = useToast();
  const sessions = useQuery(api.aiChat.listSessions, { projectId: id });
  const [sessionId, setSessionId] = useState<Id<"aiChatSessions"> | null>(null);
  const stored = useQuery(api.aiChat.getMessages, sessionId ? { sessionId } : "skip");
  const createSession = useMutation(api.aiChat.createSession);
  const addMessage = useMutation(api.aiChat.addMessage);
  const updateTitle = useMutation(api.aiChat.updateSessionTitle);
  const deleteSession = useMutation(api.aiChat.deleteSession);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const interpret = useAction(api.ai.interpret);
  const applyIntents = useMutation(api.aiIntents.applyIntents);

  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Msg[]>([]);
  const [pending, setPending] = useState<AiIntent[] | null>(null);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Id<"aiChatSessions"> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Abre na conversa mais recente.
  useEffect(() => {
    if (sessionId === null && sessions && sessions.length > 0) setSessionId(sessions[0]!._id);
  }, [sessions, sessionId]);

  const messages: Msg[] = useMemo(() => {
    const base = (stored ?? []).map((m) => ({
      key: m._id,
      role: m.role,
      text: m.text,
      intents: m.intents ? (JSON.parse(m.intents) as AiIntent[]) : undefined,
    }));
    return [...base, ...optimistic];
  }, [stored, optimistic]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, pending]);

  async function ensureSession(): Promise<Id<"aiChatSessions">> {
    if (sessionId) return sessionId;
    const created = await createSession({ projectId: id });
    setSessionId(created);
    return created;
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error("Libere a câmera nos ajustes do celular para mandar foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !photo) || sending) return;
    setSending(true);
    setPending(null);
    const first = messages.length === 0;
    const userText = text || "Foto enviada";
    setOptimistic([{ key: `u-${Date.now()}`, role: "user", text: photo ? `${userText} 📷` : userText }]);
    setInput("");
    const photoUri = photo;
    setPhoto(null);
    try {
      const sid = await ensureSession();
      await addMessage({ sessionId: sid, role: "user", text: userText });
      if (first && text) await updateTitle({ sessionId: sid, title: text.length > 50 ? `${text.slice(0, 47)}...` : text });
      const files = photoUri ? (await uploadPhotos(generateUploadUrl, [photoUri])).map((storageId, i) => ({ storageId, name: `foto-${i + 1}.jpg`, mimeType: "image/jpeg" })) : undefined;
      const context = messages.slice(-8).map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.text}`).join("\n");
      const result = await interpret({ projectId: id, message: text || undefined, context: context || undefined, files });
      const intents = result.intents as AiIntent[];
      const reply = result.needsClarification ? `${result.reply}\n\n${result.needsClarification}` : result.reply;
      await addMessage({ sessionId: sid, role: "assistant", text: reply, intents: intents.length ? JSON.stringify(intents) : undefined });
      setPending(intents.length ? intents : null);
      setOptimistic([]);
    } catch (err) {
      setOptimistic((prev) => [...prev, { key: `e-${Date.now()}`, role: "assistant", text: getErrorMessage(err, "Não deu para processar. Tente de novo.") }]);
    } finally {
      setSending(false);
    }
  }

  async function apply() {
    if (!pending || !sessionId) return;
    setApplying(true);
    try {
      const result = await applyIntents({ projectId: id, intents: pending });
      const text =
        result.applied > 0
          ? `Pronto! ${result.applied} ${result.applied === 1 ? "alteração aplicada" : "alterações aplicadas"}.\n\n${result.summary.join("\n")}`
          : `Nenhuma alteração foi aplicada.\n\n${result.summary.join("\n")}`;
      await addMessage({ sessionId, role: "assistant", text });
      setPending(null);
      toast.success(result.applied > 0 ? "Alterações aplicadas" : "Nada aplicado");
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para aplicar as alterações"));
    } finally {
      setApplying(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteSession({ sessionId: toDelete });
      if (toDelete === sessionId) {
        setSessionId(null);
        setPending(null);
      }
      toast.success("Conversa apagada");
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para apagar"));
    } finally {
      setToDelete(null);
    }
  }

  if (sessions === undefined) return <LoadingState />;
  const current = sessions.find((s) => s._id === sessionId);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={140}>
      <View style={styles.bar}>
        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]} numberOfLines={1}>
          {current?.title ?? "Nova conversa"}
        </Text>
        <IconButton tone="ghost" label="Conversas anteriores" icon={<History size={20} color={colors.text} />} onPress={() => setHistoryOpen(true)} />
        <IconButton
          tone="ghost"
          label="Nova conversa"
          icon={<Plus size={20} color={colors.text} />}
          onPress={() => {
            setSessionId(null);
            setPending(null);
            setOptimistic([]);
          }}
        />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Bot size={28} color={colors.primary} />}
            title="Peça em palavras"
            description={'Ex.: "marque os equipamentos do 12º andar como operacionais" ou "adicione 3 evaporadoras 9.000 na sala do apto 121". Nada muda na obra antes de você confirmar.'}
          />
        ) : (
          messages.map((m) => (
            <View key={m.key} style={[styles.bubble, m.role === "user" ? styles.user : styles.assistant]}>
              <Text style={[type.body, { color: m.role === "user" ? colors.onPrimary : colors.text }]}>{m.text}</Text>
            </View>
          ))
        )}
        {sending ? (
          <View style={[styles.bubble, styles.assistant, { flexDirection: "row", gap: space.sm, alignItems: "center" }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>Pensando…</Text>
          </View>
        ) : null}
        {pending ? (
          <Surface style={styles.proposal}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>
              {pending.length === 1 ? "1 alteração proposta" : `${pending.length} alterações propostas`}
            </Text>
            {pending.map((intent, index) => {
              const d = describeIntent(intent);
              return (
                <View key={index} style={styles.intent}>
                  <Text style={[type.label, { color: colors.text }]}>{d.title}</Text>
                  {d.detail ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{d.detail}</Text> : null}
                </View>
              );
            })}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <AppButton label="Descartar" variant="secondary" size="sm" icon={<X size={16} color={colors.text} />} disabled={applying} onPress={() => setPending(null)} style={{ flex: 1 }} />
              <AppButton label="Confirmar" size="sm" icon={<Check size={16} color={colors.onPrimary} />} loading={applying} loadingLabel="Aplicando…" onPress={() => void apply()} style={{ flex: 1 }} />
            </View>
          </Surface>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        {photo ? (
          <Pressable onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel="Remover foto" style={styles.photoChip}>
            <Camera size={14} color={colors.text} />
            <Text style={[type.caption, { color: colors.text }]}>Foto anexada</Text>
            <X size={14} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.inputRow}>
          <IconButton tone="ghost" label="Tirar foto" icon={<Camera size={20} color={colors.icon} />} onPress={() => void pickPhoto()} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Escreva o que mudar na obra"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={styles.input}
          />
          <IconButton tone="primary" label="Enviar" disabled={sending || (!input.trim() && !photo)} icon={<Send size={18} color={colors.onPrimary} />} onPress={() => void send()} />
        </View>
      </View>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversas da obra">
        {sessions.length === 0 ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhuma conversa ainda.</Text>
        ) : (
          <Surface padded={false}>
            {sessions.map((s, index) => (
              <View key={s._id} style={[styles.sessionRow, index > 0 && styles.border]}>
                <Pressable
                  style={{ flex: 1, gap: 2 }}
                  onPress={() => {
                    setSessionId(s._id);
                    setPending(null);
                    setOptimistic([]);
                    setHistoryOpen(false);
                  }}
                >
                  <Text style={[type.body, { color: colors.text, fontWeight: s._id === sessionId ? "600" : "400" }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{formatDateTime(s.updatedAt)}</Text>
                </Pressable>
                <IconButton tone="ghost" size={36} label="Apagar conversa" icon={<Trash2 size={16} color={colors.destructive} />} onPress={() => setToDelete(s._id)} />
              </View>
            ))}
          </Surface>
        )}
      </Sheet>
      <ConfirmDialog
        open={toDelete !== null}
        title="Apagar esta conversa?"
        description="As mensagens somem. O que já foi aplicado na obra continua."
        confirmLabel="Apagar"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.screen, paddingTop: space.sm },
  messages: { padding: space.screen, gap: space.sm, paddingBottom: space.xl },
  bubble: { maxWidth: "88%", borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  user: { alignSelf: "flex-end", backgroundColor: colors.primary },
  assistant: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  proposal: { gap: space.md, borderColor: colors.primary },
  intent: { gap: 2, borderLeftWidth: 3, borderLeftColor: colors.primarySoft, paddingLeft: space.sm },
  composer: { borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface, padding: space.sm, gap: space.xs },
  photoChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  input: { flex: 1, minHeight: 44, maxHeight: 120, ...type.body, color: colors.text, paddingHorizontal: space.sm, paddingVertical: 10 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
});
