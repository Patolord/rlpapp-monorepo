import { Package } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function useCanHover() {
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(HOVER_QUERY);
    const update = () => setCanHover(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return canHover;
}

type MaterialImageThumbProps = {
  imageUrl: string | null;
  alt: string;
  className?: string;
};

export function MaterialImageThumb({
  imageUrl,
  alt,
  className,
}: MaterialImageThumbProps) {
  const canHover = useCanHover();
  const [open, setOpen] = useState(false);

  const thumb = (
    <span
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
        className
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <Package className="size-4 text-muted-foreground/70" />
      )}
    </span>
  );

  if (!imageUrl) {
    return thumb;
  }

  return (
    <Tooltip
      open={canHover ? undefined : open}
      onOpenChange={canHover ? undefined : (next) => setOpen(next)}
    >
      <TooltipTrigger
        type="button"
        aria-label={`Ver imagem de ${alt}`}
        className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!canHover) setOpen((current) => !current);
        }}
      >
        {thumb}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        className="max-w-none border bg-background p-1.5 text-foreground shadow-md"
        arrowClassName="bg-background fill-background"
      >
        <img
          src={imageUrl}
          alt={alt}
          className="size-[220px] rounded-sm object-cover"
        />
      </TooltipContent>
    </Tooltip>
  );
}
