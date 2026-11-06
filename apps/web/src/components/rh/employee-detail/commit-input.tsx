import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";

/** Campo que salva ao sair (blur/Enter), acompanhando o valor vindo do servidor. */
export function CommitInput({
  value,
  onCommit,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <Input
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text === value) return;
        try {
          onCommit(text);
        } catch (error) {
          // Valor que não dá para interpretar (ex.: "abc"): avisa e volta ao salvo.
          toast.error(getErrorMessage(error, "Valor inválido"));
          setText(value);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
  );
}
