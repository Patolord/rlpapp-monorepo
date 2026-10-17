import { useEffect, useState } from "react";

import { AppButton, Field, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  helper?: string;
};

/**
 * Sheet de formulário simples (1–4 campos de texto) para nomes e detalhes:
 * torre, andar, ambiente, sistema.
 */
export function SimpleFormSheet({
  open,
  onClose,
  title,
  subtitle,
  fields,
  initial,
  submitLabel = "Salvar",
  onSubmit,
  successMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  successMessage?: string;
}) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(fields.map((f) => [f.key, initial?.[f.key] ?? ""])));
    setErrors({});
    // `fields` é estável por chamador; `initial` muda quando o alvo muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  async function submit() {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) nextErrors[field.key] = "Obrigatório";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
      if (successMessage) toast.success(successMessage);
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
      title={title}
      subtitle={subtitle}
      maxHeight={0.8}
      footer={<AppButton label={submitLabel} onPress={() => void submit()} loading={saving} />}
    >
      {fields.map((field, index) => (
        <Field
          key={field.key}
          label={field.required ? `${field.label} *` : field.label}
          value={values[field.key] ?? ""}
          onChangeText={(v) => {
            setValues((current) => ({ ...current, [field.key]: v }));
            if (errors[field.key]) setErrors((current) => ({ ...current, [field.key]: "" }));
          }}
          placeholder={field.placeholder}
          multiline={field.multiline}
          keyboardType={field.keyboardType}
          error={errors[field.key] || undefined}
          helper={field.helper}
          autoFocus={index === 0}
          autoCapitalize="sentences"
        />
      ))}
    </Sheet>
  );
}
