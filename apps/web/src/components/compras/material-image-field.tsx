import { ImagePlus, Package, X } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const ALLOWED_IMAGE_ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");

function isAllowedImageMimeType(type: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/** Imagem do material: pré-visualização, anexar/trocar e remover. */
export function MaterialImageField({
  imagePreviewUrl,
  onSelect,
  onRemove,
}: {
  imagePreviewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAllowedImageMimeType(file.type)) {
      toast.error("Selecione uma imagem JPG, PNG ou WebP");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("A imagem deve ter no máximo 5 MB");
      return;
    }
    onSelect(file);
  }

  return (
    <div>
      <Label>Imagem</Label>
      <div className="mt-1 flex items-start gap-3">
        <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt="Pré-visualização do material"
              className="size-full object-cover"
            />
          ) : (
            <Package className="size-6 text-muted-foreground/70" />
          )}
        </span>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {imagePreviewUrl ? "Trocar imagem" : "Anexar imagem"}
            </Button>
            {imagePreviewUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRemove}
              >
                <X className="size-4" />
                Remover
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG ou WebP. Máximo 5 MB.
          </p>
        </div>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept={ALLOWED_IMAGE_ACCEPT}
        className="hidden"
        onChange={handleImageChange}
      />
    </div>
  );
}
