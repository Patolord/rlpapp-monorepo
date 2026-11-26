import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OfflineBanner } from "@/components/campo/offline-banner";
import { firstName } from "@/components/campo/stage-people";
import { PhotoPicker } from "@/components/engenharia/photo-picker";
import { AppButton, Banner, ChoiceChips, ChoiceGroup, Field, Sheet, useToast, type ChoiceOption } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";
import { useOnline } from "@/lib/use-online";

type Outcome = "continues" | "concluded";

const OUTCOME_OPTIONS: ChoiceOption<Outcome>[] = [
  { value: "continues", label: "Continua depois" },
  { value: "concluded", label: "Concluído" },
];

const MAX_PHOTOS = 10;

/**
 * Registro de uma etapa de serviço: o que foi feito, se o serviço continua ou
 * foi concluído, quem fez e fotos. Sem fila offline: sem sinal, o envio fica
 * bloqueado até a conexão voltar.
 */
export function RegisterStageSheet({
  open,
  onClose,
  projectId,
  disciplineId,
  disciplineName,
  location,
  allowLocationEdit,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  disciplineId: Id<"projectDisciplines">;
  disciplineName: string;
  /** Local do serviço; `null` vale para a disciplina inteira. */
  location: string | null;
  /** Deixa digitar o local (para começar um serviço que ainda não está na lista). */
  allowLocationEdit?: boolean;
  onSubmitted?: () => void;
}) {
  const toast = useToast();
  const online = useOnline();
  const team = useQuery(api.fieldServices.listTeam, open ? { projectId } : "skip");
  const currentUser = useQuery(api.users.getCurrentUser);
  const generateUploadUrl = useMutation(api.fieldServices.generateUploadUrl);
  const registerStage = useMutation(api.fieldServices.registerServiceStage);

  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("continues");
  const [pendingNote, setPendingNote] = useState("");
  // `null`: ninguém mexeu ainda, vale o padrão (só quem está registrando).
  const [picked, setPicked] = useState<Id<"users">[] | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLocationText(location ?? "");
      return;
    }
    setDescription("");
    setLocationText("");
    setOutcome("continues");
    setPendingNote("");
    setPicked(null);
    setPhotos([]);
    setAttempted(false);
    setError(null);
  }, [open, location]);

  const meId = team?.members.find((member) => member.isMe)?._id ?? currentUser?._id ?? null;

  const people = useMemo(() => {
    const members = team?.members ?? [];
    const others = members.filter((member) => !member.isMe);
    const options = members.map((member) => {
      if (member.isMe) return { value: member._id, label: "Você" };
      const short = firstName(member.name);
      // Dois colegas com o mesmo primeiro nome aparecem com o nome completo.
      const repeated = others.some((other) => other._id !== member._id && firstName(other.name) === short);
      return { value: member._id, label: repeated ? member.name : short };
    });
    // Líder que enxerga todas as obras pode não estar na equipe desta.
    if (meId && !members.some((member) => member._id === meId)) {
      options.unshift({ value: meId, label: "Você" });
    }
    return options;
  }, [team, meId]);

  const participantIds = (picked ?? (meId ? [meId] : [])).filter((id) => people.some((person) => person.value === id));

  const typedLocation = locationText.trim();
  const stageLocation = allowLocationEdit ? typedLocation || null : location;
  const descriptionError = attempted && !description.trim() ? "Descreva o que foi feito" : undefined;
  const peopleError = attempted && participantIds.length === 0 ? "Marque quem fez" : undefined;

  async function submit() {
    setAttempted(true);
    // Espaços e quebras de linha viram um espaço: a etapa aparece em uma linha nas listas.
    const text = description.trim().replace(/\s+/g, " ");
    if (!text || participantIds.length === 0 || !online) return;
    const note = pendingNote.trim().replace(/\s+/g, " ");
    setSubmitting(true);
    setError(null);
    try {
      const photoIds = await uploadPhotos(() => generateUploadUrl({}), photos);
      await registerStage({
        disciplineId,
        location: stageLocation ?? undefined,
        description: text,
        outcome,
        pendingNote: outcome === "continues" && note ? note : undefined,
        participantIds,
        photoIds,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast.success("Etapa registrada");
      onClose();
      onSubmitted?.();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível registrar a etapa"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      // Fechar no meio do envio apagaria o formulário com as fotos ainda subindo.
      onClose={submitting ? () => undefined : onClose}
      title="Registrar etapa"
      subtitle={stageLocation ? `${disciplineName} · ${stageLocation}` : disciplineName}
      footer={
        <AppButton
          label="Registrar etapa"
          loadingLabel="Registrando..."
          onPress={() => void submit()}
          loading={submitting}
          disabled={!online}
        />
      }
    >
      <OfflineBanner detail="Registre a etapa quando voltar o sinal." />
      {error ? <Banner tone="danger" title={error} /> : null}

      <Field
        label="O que foi feito"
        value={description}
        onChangeText={setDescription}
        error={descriptionError}
        maxLength={200}
        multiline
      />

      {allowLocationEdit ? (
        <Field
          label="Local"
          value={locationText}
          onChangeText={setLocationText}
          helper="Opcional. Ex.: Apto 302"
          maxLength={80}
        />
      ) : null}

      <ChoiceGroup label="Situação do serviço" value={outcome} options={OUTCOME_OPTIONS} onChange={setOutcome} />

      {outcome === "continues" ? (
        <Field
          label="O que falta"
          value={pendingNote}
          onChangeText={setPendingNote}
          helper="Opcional"
          maxLength={200}
        />
      ) : null}

      <ChoiceChips label="Quem fez" values={participantIds} options={people} onChange={setPicked} error={peopleError} />

      <View style={styles.photos}>
        <Text style={[type.label, { color: colors.text }]}>Fotos</Text>
        <PhotoPicker uris={photos} onUrisChange={(uris) => setPhotos(uris.slice(0, MAX_PHOTOS))} />
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>Opcional. Até {MAX_PHOTOS} fotos.</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  photos: { gap: 6 },
});
