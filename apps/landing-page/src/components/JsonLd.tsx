/**
 * Renderiza dados estruturados (schema.org) como JSON-LD.
 * O `<` é escapado para o JSON não conseguir fechar a tag <script>.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
