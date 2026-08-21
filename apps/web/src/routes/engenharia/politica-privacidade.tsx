import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_POLICY_PATH = "/politica-privacidade";
const EXAMPLE_URL = "https://exemplo.com/privacy";

export const Route = createFileRoute("/engenharia/politica-privacidade")({
  component: PoliticaPrivacidadeSettingsPage,
});

function PoliticaPrivacidadeSettingsPage() {
  return (
    <AuthShell>
      <PrivacyPolicyUrlForm />
    </AuthShell>
  );
}

function getDefaultPolicyUrl() {
  if (typeof window === "undefined") {
    return `https://app.rlpeng.com.br${DEFAULT_POLICY_PATH}`;
  }
  return `${window.location.origin}${DEFAULT_POLICY_PATH}`;
}

function validatePolicyUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Informe a URL da política de privacidade.";
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Informe um URL válido, como https://exemplo.com/privacy.";
  }

  if (parsed.protocol !== "https:") {
    return "Use um URL com HTTPS.";
  }

  return null;
}

function PrivacyPolicyUrlForm() {
  const defaultUrl = useMemo(() => getDefaultPolicyUrl(), []);
  const [url, setUrl] = useState(defaultUrl);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const isDirty = url.trim() !== defaultUrl;
  const error = touched || isDirty ? validatePolicyUrl(url) : null;
  const canSave = !error && !saving && url.trim().length > 0;

  function handleDiscard() {
    setUrl(defaultUrl);
    setTouched(false);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);

    const validationError = validatePolicyUrl(url);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const normalized = url.trim();
      await navigator.clipboard.writeText(normalized);
      toast.success("URL copiada. Cole no Google Play Console.");
      setUrl(normalized);
    } catch {
      toast.error("Não foi possível copiar a URL. Copie manualmente o campo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <form
        onSubmit={handleSave}
        className="flex min-h-[calc(100dvh-8rem)] flex-col"
      >
        <div className="flex-1 space-y-8 pb-28">
          <div className="space-y-4">
            <Link
              to="/app"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Painel
            </Link>

            <h1 className="text-3xl font-semibold tracking-tight">
              Política de Privacidade
            </h1>

            <p className="max-w-2xl text-base text-muted-foreground">
              Adicionar uma Política de Privacidade à página do app dá mais
              transparência sobre como você lida com os dados do usuário e do
              dispositivo.{" "}
              <Link
                to="/politica-privacidade"
                className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Saiba mais
              </Link>
            </p>
            <p className="max-w-2xl text-base text-muted-foreground">
              Confira a política de dados do usuário para evitar violações
              comuns no Google Play.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="privacy-policy-url">
              URL da Política de Privacidade{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="privacy-policy-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              required
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={
                error ? "privacy-policy-url-error" : "privacy-policy-url-help"
              }
              placeholder={EXAMPLE_URL}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => setTouched(true)}
              className="h-12 text-base"
            />
            {error ? (
              <p
                id="privacy-policy-url-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : (
              <p
                id="privacy-policy-url-help"
                className="text-sm text-muted-foreground"
              >
                Insira um URL, como {EXAMPLE_URL}
              </p>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="ghost"
            disabled={!isDirty || saving}
            onClick={handleDiscard}
          >
            Descartar
          </Button>
          <Button type="submit" disabled={!canSave}>
            {saving && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
    </div>
  );
}
