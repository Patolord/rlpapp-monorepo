import { BigRow } from "./field-ui";
import { obraSubtitle, obraTitle } from "./obra";

interface ObraListItemProps {
  project: {
    name: string;
    legacyNumber: number | null;
    client: string | null;
  };
  onPress: () => void;
  /** Última obra aberta neste aparelho: aparece em destaque. */
  highlight?: boolean;
}

/** Linha de obra usada em "Minhas obras" e na busca por outras obras. */
export function ObraListItem({ project, onPress, highlight }: ObraListItemProps) {
  return (
    <BigRow
      title={obraTitle(project)}
      subtitle={obraSubtitle(project)}
      onPress={onPress}
      highlight={highlight}
    />
  );
}
