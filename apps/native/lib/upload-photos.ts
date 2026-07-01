import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

/**
 * Sobe fotos (URIs locais do aparelho) para o Convex Storage e retorna os
 * storage IDs. No React Native, `fetch(uri)` em um file:// resolve para um Blob.
 */
export async function uploadPhotos(
  generateUploadUrl: () => Promise<string>,
  uris: string[]
): Promise<Id<"_storage">[]> {
  const ids: Id<"_storage">[] = [];
  for (const uri of uris) {
    const uploadUrl = await generateUploadUrl();
    const fileResponse = await fetch(uri);
    const blob = await fileResponse.blob();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (!result.ok) {
      throw new Error(`Falha no upload da foto (${result.status})`);
    }
    const { storageId } = (await result.json()) as { storageId: string };
    ids.push(storageId as Id<"_storage">);
  }
  return ids;
}
