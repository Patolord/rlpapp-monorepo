import { ImageIcon } from "lucide-react";

interface PlaceholderImageProps {
  className?: string;
  alt?: string;
}

export default function PlaceholderImage({ 
  className = "", 
  alt = "Imagem não disponível" 
}: PlaceholderImageProps) {
  return (
    <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
      <div className="text-center text-gray-400">
        <ImageIcon className="h-12 w-12 mx-auto mb-2" />
        <p className="text-sm font-medium">{alt}</p>
      </div>
    </div>
  );
}
