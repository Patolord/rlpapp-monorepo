import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface PhotoPickerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
}

/**
 * Seleciona fotos localmente (câmera ou galeria) sem fazer upload.
 * O upload acontece só no envio do formulário — assim funciona offline.
 */
export function PhotoPicker({ files, onFilesChange, label }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    onFilesChange([...files, ...Array.from(selected)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removePhoto(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        className="h-14 w-full text-lg"
      >
        <Camera className="mr-2 h-5 w-5" />
        {label ?? "Tirar / Adicionar Fotos"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {previewUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previewUrls.map((url, index) => (
            <div key={index} className="relative aspect-square">
              <img
                src={url}
                alt={`Foto ${index + 1}`}
                className="h-full w-full rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm"
                aria-label={`Remover foto ${index + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
