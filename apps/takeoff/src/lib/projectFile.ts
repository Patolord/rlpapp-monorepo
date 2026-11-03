import { basename, dirname, isInside, relativePath, resolveRelative } from "./paths";
import type { Drawing, DrawingRevision, Project } from "./types";

/**
 * A takeoff file that lives in a folder synced by OneDrive or SharePoint has to open on every
 * machine that syncs the folder. Drawings keep this machine's absolute `path`; on save each one
 * also gets a `relPath` from the takeoff file's folder, and on open a `path` that does not exist
 * here is looked up through it.
 */

/** The project as written to `filePath`: every PDF also relative to the file's folder. */
export function withRelativePaths(project: Project, filePath: string): Project {
  const dir = dirname(filePath);
  const rel = <T extends { path: string | null; relPath?: string }>(d: T): T => {
    const { relPath: _old, ...rest } = d;
    const r = d.path ? relativePath(dir, d.path) : null;
    return (r ? { ...rest, relPath: r } : rest) as T;
  };
  return {
    ...project,
    drawings: project.drawings.map((d) => {
      const out: Drawing = rel(d);
      if (d.revisions) out.revisions = d.revisions.map((r) => rel(r));
      return out;
    }),
  };
}

/**
 * The project as opened from `filePath` on this machine: a PDF whose `path` is missing here but
 * whose `relPath` resolves to an existing file points there. `path` wins when it exists, so a
 * `relPath` left stale by an older version of the app never redirects a drawing. `relPath` is
 * dropped: the next save writes it afresh.
 */
export async function resolveDrawingPaths(
  project: Project,
  filePath: string,
  exists: (path: string) => Promise<boolean>,
): Promise<{ project: Project; relinked: number }> {
  const dir = dirname(filePath);
  let relinked = 0;
  const resolve = async <T extends { path: string | null; relPath?: string }>(d: T): Promise<T> => {
    const { relPath, ...rest } = d;
    if (!relPath || (d.path && (await exists(d.path)))) return rest as T;
    const local = resolveRelative(dir, relPath);
    if (local && local !== d.path && (await exists(local))) {
      relinked++;
      return { ...rest, path: local } as T;
    }
    return rest as T;
  };
  const drawings: Drawing[] = [];
  for (const d of project.drawings) {
    const out = await resolve(d);
    if (d.revisions) {
      const revisions: DrawingRevision[] = [];
      for (const r of d.revisions) revisions.push(await resolve(r));
      out.revisions = revisions;
    }
    drawings.push(out);
  }
  return { project: { ...project, drawings }, relinked };
}

/**
 * Drawings another machine will not find: kept in a folder that is not synced (`localDirs`:
 * Downloads, the temp folder) or on another drive than the takeoff file. Their names, for a
 * warning after saving.
 */
export function unportableDrawings(
  project: Project,
  filePath: string,
  localDirs: string[],
): string[] {
  const dir = dirname(filePath);
  return project.drawings
    .filter(
      (d) =>
        d.path !== null &&
        (relativePath(dir, d.path) === null ||
          localDirs.some((local) => isInside(d.path as string, local))),
    )
    .map((d) => d.name || basename(d.path as string));
}

/**
 * Fingerprint of a file's text, to notice that another machine (through OneDrive or SharePoint
 * sync) rewrote the takeoff file since this window read or wrote it. cyrb53: fast, and good
 * enough to tell two versions of a document apart.
 */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

/** Where to offer "Salvar como cópia": beside the file, `<name> (cópia).takeoff.json`. */
export function copyPathFor(filePath: string): string {
  const name = basename(filePath);
  const stem = name.replace(/\.takeoff\.json$/i, "").replace(/\.json$/i, "");
  const dir = dirname(filePath);
  const sep = dir.includes("\\") || /^[a-zA-Z]:/.test(dir) ? "\\" : "/";
  return `${dir}${dir.endsWith(sep) ? "" : sep}${stem} (cópia).takeoff.json`;
}
