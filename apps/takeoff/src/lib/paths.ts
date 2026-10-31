/**
 * Path arithmetic for project files kept in a synced folder (OneDrive, SharePoint), where the
 * same folder sits under a different root on every machine: `C:\Users\ana\OneDrive - RLP\…`
 * on one PC, `/Users/rodrigo/Library/CloudStorage/OneDrive-RLP/…` on a Mac. Plain string work,
 * so it runs the same on either platform and in tests.
 */

interface SplitPath {
  /** `C:`, `\\server\share`, `/`, or "" for a relative path. */
  root: string;
  segments: string[];
  /** Windows paths (drive or UNC) compare case-insensitively and join with `\`. */
  windows: boolean;
}

function splitPath(path: string): SplitPath {
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(.*)$/.exec(path);
  if (unc) {
    return { root: `\\\\${unc[1]}\\${unc[2]}`, segments: parts(unc[3]), windows: true };
  }
  const drive = /^([a-zA-Z]):(.*)$/.exec(path);
  if (drive)
    return { root: `${drive[1].toUpperCase()}:`, segments: parts(drive[2]), windows: true };
  if (path.startsWith("/")) return { root: "/", segments: parts(path), windows: false };
  return { root: "", segments: parts(path), windows: false };
}

const parts = (s: string): string[] => s.split(/[\\/]+/).filter((p) => p !== "" && p !== ".");

const sameSegment = (a: string, b: string, windows: boolean): boolean =>
  windows ? a.toLowerCase() === b.toLowerCase() : a === b;

/** The last segment of a path: the file name. */
export const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** The folder containing `path` (the path itself when it has no parent). */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i < 0) return path;
  if (i === 0) return path.slice(0, 1);
  // keep the separator of a drive root: dirname("C:\\a.json") is "C:\\"
  if (i === 2 && /^[a-zA-Z]:/.test(path)) return path.slice(0, 3);
  return path.slice(0, i);
}

/**
 * `to` relative to the folder `fromDir`, with `/` separators (`../Projetos/ARQ-101.pdf`), or
 * null when the two do not share a root (another drive, another server share) or either path
 * is not absolute.
 */
export function relativePath(fromDir: string, to: string): string | null {
  const a = splitPath(fromDir);
  const b = splitPath(to);
  if (!a.root || !b.root || a.windows !== b.windows) return null;
  if (!sameSegment(a.root, b.root, a.windows)) return null;
  let common = 0;
  while (
    common < a.segments.length &&
    common < b.segments.length &&
    sameSegment(a.segments[common], b.segments[common], a.windows)
  ) {
    common++;
  }
  const up = a.segments.slice(common).map(() => "..");
  const down = b.segments.slice(common);
  const rel = [...up, ...down];
  return rel.length > 0 ? rel.join("/") : null;
}

/**
 * Resolve a path stored by `relativePath` against the folder `fromDir`, written with that
 * folder's separators. Null when `..` climbs above the root.
 */
export function resolveRelative(fromDir: string, rel: string): string | null {
  const base = splitPath(fromDir);
  if (!base.root) return null;
  const out = [...base.segments];
  for (const seg of parts(rel)) {
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  const sep = base.windows ? "\\" : "/";
  if (base.root === "/") return `/${out.join("/")}`;
  return `${base.root}${sep}${out.join(sep)}`;
}

/** Whether `path` lies inside the folder `dir` (same root, `dir` a prefix of its segments). */
export function isInside(path: string, dir: string): boolean {
  const p = splitPath(path);
  const d = splitPath(dir);
  if (!p.root || !d.root || !sameSegment(p.root, d.root, p.windows || d.windows)) return false;
  if (d.segments.length >= p.segments.length) return false;
  return d.segments.every((s, i) => sameSegment(s, p.segments[i], p.windows || d.windows));
}
