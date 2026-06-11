import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

/** Sobe fotos para o Convex Storage e retorna os storage IDs. */
export async function uploadPhotos(
  generateUploadUrl: () => Promise<string>,
  files: (File | Blob)[]
): Promise<Id<"_storage">[]> {
  const ids: Id<"_storage">[] = [];
  for (const file of files) {
    const url = await generateUploadUrl();
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    if (!result.ok) {
      throw new Error(`Falha no upload da foto (${result.status})`);
    }
    const { storageId } = (await result.json()) as { storageId: string };
    ids.push(storageId as Id<"_storage">);
  }
  return ids;
}
