import {
  formatMinute,
  PUNCH_ROLE_LABEL,
  type MissedPunch,
  type PunchPrompt,
  type PunchPromptOption,
} from "@rlpapp/shared/rh/pontoDay";
import { Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, Sheet } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

const STEP_MINUTES = 5;

/**
 * Pergunta curta antes de registrar, quando algo não bate (marcação
 * esquecida, toque repetido, volta depois da saída). Os horários esquecidos
 * já vêm sugeridos: a pessoa só confere e toca num botão. Fechar não registra.
 */
export function PunchPromptSheet({
  prompt,
  nowMinute,
  onChoose,
  onClose,
}: {
  prompt: PunchPrompt | null;
  /** Horário da marcação (o esquecido não pode passar dele). */
  nowMinute: number;
  onChoose: (option: PunchPromptOption) => void;
  onClose: () => void;
}) {
  const [missed, setMissed] = useState<MissedPunch[]>([]);
  useEffect(() => setMissed(prompt?.missed ?? []), [prompt]);

  const shift = (index: number, delta: number) => {
    setMissed((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        const prev = i > 0 ? current[i - 1]!.minute : -1;
        const next = i < current.length - 1 ? current[i + 1]!.minute : nowMinute;
        const minute = Math.min(next - 1, Math.max(prev + 1, item.minute + delta));
        return { ...item, minute };
      })
    );
  };

  const choose = (option: PunchPromptOption) => {
    // A opção "esqueci" leva os horários como a pessoa deixou.
    onChoose(option.missed.length > 0 ? { ...option, missed } : option);
  };

  return (
    <Sheet
      open={prompt !== null}
      onClose={onClose}
      title={prompt?.title ?? ""}
      subtitle={prompt?.message || undefined}
      footer={
        prompt ? (
          <>
            {prompt.options.map((option, index) => (
              <AppButton
                key={option.key}
                label={option.label}
                size="lg"
                block
                trailing={null}
                variant={option.cancel ? "ghost" : index === 0 ? "primary" : "secondary"}
                onPress={() => choose(option)}
              />
            ))}
          </>
        ) : null
      }
    >
      {missed.map((item, index) => (
        <View key={item.slot} style={styles.row}>
          <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>
            {PUNCH_ROLE_LABEL[item.slot]}
          </Text>
          <StepButton label={`Menos ${STEP_MINUTES} minutos`} onPress={() => shift(index, -STEP_MINUTES)}>
            <Minus size={20} color={colors.text} />
          </StepButton>
          <Text style={styles.time}>{formatMinute(item.minute)}</Text>
          <StepButton label={`Mais ${STEP_MINUTES} minutos`} onPress={() => shift(index, STEP_MINUTES)}>
            <Plus size={20} color={colors.text} />
          </StepButton>
        </View>
      ))}
    </Sheet>
  );
}

function StepButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  time: {
    ...type.title,
    color: colors.text,
    minWidth: 64,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
