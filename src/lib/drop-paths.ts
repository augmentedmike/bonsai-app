/**
 * Utility for extracting local file/folder paths from drag-and-drop events.
 * macOS Finder provides file:// URIs in the text/uri-list data type.
 */

export interface DroppedPath {
  id: string;
  name: string;
  path: string;
}

/** Extract local file paths from a drop event (Finder → browser). */
export function extractPathsFromDrop(dataTransfer: DataTransfer): DroppedPath[] {
  const paths: DroppedPath[] = [];
  const seen = new Set<string>();

  function add(filePath: string) {
    if (!filePath || seen.has(filePath)) return;
    seen.add(filePath);
    const name = filePath.split("/").filter(Boolean).pop() || filePath;
    paths.push({ id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, path: filePath });
  }

  // 1. text/uri-list — macOS Finder drops file:// URIs here
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("file://")) {
        add(decodeURIComponent(new URL(trimmed).pathname));
      }
    }
  }

  // 2. text/plain fallback — some apps drop absolute paths as plain text
  if (paths.length === 0) {
    const plain = dataTransfer.getData("text/plain");
    if (plain) {
      for (const line of plain.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("/") && !trimmed.includes("\t")) {
          add(trimmed);
        }
      }
    }
  }

  // 3. File objects with .path (Electron gives this)
  if (paths.length === 0 && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      const fp = (file as unknown as { path?: string }).path;
      if (fp) add(fp);
    }
  }

  return paths;
}

/** Format a dropped path as markdown for embedding in description text. */
export function pathToMarkdown(dp: DroppedPath): string {
  return `**${dp.name}** \`${dp.path}\``;
}

/** Shorten a path to the last N segments for display. */
export function truncatePath(fullPath: string, maxSegments = 3): string {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return "/" + segments.join("/");
  return ".../" + segments.slice(-maxSegments).join("/");
}
