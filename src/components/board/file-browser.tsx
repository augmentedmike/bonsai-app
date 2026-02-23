"use client";

import { useEffect, useState, useMemo } from "react";

interface FileEntry {
  path: string;
  isDir: boolean;
  size: number;
}

interface FileBrowserProps {
  ticketId: number;
}

// Build a tree structure from flat file list
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.path.split("/");
    let parentList = root;
    let currentPath = "";

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      let dir = dirs.get(currentPath);
      if (!dir) {
        dir = { name: parts[i], path: currentPath, isDir: true, size: 0, children: [] };
        dirs.set(currentPath, dir);
        parentList.push(dir);
      }
      parentList = dir.children;
    }

    const name = parts[parts.length - 1];
    if (file.isDir) {
      if (!dirs.has(file.path)) {
        const node = { name, path: file.path, isDir: true, size: 0, children: [] };
        dirs.set(file.path, node);
        parentList.push(node);
      }
    } else {
      parentList.push({ name, path: file.path, isDir: false, size: file.size, children: [] });
    }
  }

  return root;
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => ({ ...n, children: sortTree(n.children) }))
    .sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    ts: "TS", tsx: "TX", js: "JS", jsx: "JX",
    json: "{}", md: "MD", css: "CS", html: "HT",
    py: "PY", rs: "RS", go: "GO", sql: "SQ",
    yaml: "YM", yml: "YM", toml: "TM",
    sh: "SH", bash: "SH", zsh: "SH",
    env: "EN", txt: "TX", csv: "CS",
    png: "IM", jpg: "IM", jpeg: "IM", gif: "IM", svg: "SV",
  };
  return iconMap[ext] || "  ";
}

function getFileColor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colorMap: Record<string, string> = {
    ts: "#3178c6", tsx: "#3178c6", js: "#f7df1e", jsx: "#f7df1e",
    json: "#e6a817", md: "#519aba", css: "#563d7c", html: "#e34c26",
    py: "#3572A5", rs: "#dea584", go: "#00ADD8", sql: "#e38c00",
    yaml: "#cb171e", yml: "#cb171e", sh: "#89e051", bash: "#89e051",
    svg: "#ffb13b", png: "#a074c4", jpg: "#a074c4",
  };
  return colorMap[ext] || "var(--text-muted)";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function TreeItem({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelect,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelect: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <>
      <div
        onClick={() => {
          if (node.isDir) {
            onToggleDir(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        className="flex items-center gap-1.5 py-0.5 pr-2 cursor-pointer transition-colors hover:bg-white/5 rounded"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : undefined,
          color: isSelected ? "var(--accent-blue)" : "var(--text-secondary)",
        }}
      >
        {node.isDir ? (
          <span className="w-4 text-center flex-shrink-0" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : (
          <span
            className="w-4 text-center flex-shrink-0 font-mono font-bold"
            style={{ fontSize: "7px", color: getFileColor(node.name), letterSpacing: "-0.5px" }}
          >
            {getFileIcon(node.name)}
          </span>
        )}
        <span
          className="truncate text-xs"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {node.name}
        </span>
      </div>
      {node.isDir && isExpanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          onSelect={onSelect}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}

export function FileBrowser({ ticketId }: FileBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [rootType, setRootType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Load file listing
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/tickets/${ticketId}/files`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setFiles(data.files || []);
          setRootType(data.root || "project");
          // Auto-expand src dir
          const srcDir = (data.files || []).find((f: FileEntry) => f.isDir && f.path === "src");
          if (srcDir) {
            setExpandedDirs(new Set(["src"]));
          }
        }
      })
      .catch(() => setError("Failed to load files"))
      .finally(() => setLoading(false));
  }, [ticketId]);

  // Load file content
  useEffect(() => {
    if (!selectedPath) {
      setFileContent(null);
      setContentError(null);
      return;
    }
    setLoadingContent(true);
    setContentError(null);
    fetch(`/api/tickets/${ticketId}/files?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setContentError(data.error);
          setFileContent(null);
        } else {
          setFileContent(data.content);
        }
      })
      .catch(() => setContentError("Failed to load file"))
      .finally(() => setLoadingContent(false));
  }, [ticketId, selectedPath]);

  const tree = useMemo(() => sortTree(buildTree(files)), [files]);

  function toggleDir(dirPath: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "var(--text-muted)" }}>
        <div className="flex items-center gap-2 text-sm">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading files...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "var(--text-muted)" }}>
        <div className="text-center">
          <div className="text-sm mb-1">{error}</div>
          <div className="text-xs">No worktree found for this ticket</div>
        </div>
      </div>
    );
  }

  const lines = fileContent?.split("\n") || [];

  return (
    <div className="flex h-full rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)", minHeight: "400px" }}>
      {/* File tree */}
      <div
        className="flex-shrink-0 overflow-y-auto border-r"
        style={{
          width: "220px",
          borderColor: "var(--border-subtle)",
          backgroundColor: "rgba(0,0,0,0.2)",
        }}
      >
        <div className="px-3 py-2 text-xs font-semibold border-b flex items-center gap-1.5" style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          {rootType === "worktree" ? "Worktree" : "Project"}
        </div>
        <div className="py-1">
          {tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onSelect={setSelectedPath}
              onToggleDir={toggleDir}
            />
          ))}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedPath ? (
          <>
            <div
              className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "rgba(0,0,0,0.15)" }}
            >
              <span
                className="text-xs truncate"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}
              >
                {selectedPath}
              </span>
              {fileContent && (
                <span className="text-xs flex-shrink-0 ml-2" style={{ color: "var(--text-muted)" }}>
                  {lines.length} lines · {formatSize(new Blob([fileContent]).size)}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {loadingContent ? (
                <div className="flex items-center justify-center h-32" style={{ color: "var(--text-muted)" }}>
                  <span className="text-sm">Loading...</span>
                </div>
              ) : contentError ? (
                <div className="flex items-center justify-center h-32" style={{ color: "var(--text-muted)" }}>
                  <span className="text-sm">{contentError}</span>
                </div>
              ) : fileContent !== null ? (
                <pre
                  className="text-xs leading-5 p-0 m-0"
                  style={{
                    fontFamily: "var(--font-mono, 'SF Mono', Menlo, monospace)",
                    color: "var(--text-primary)",
                    tabSize: 2,
                  }}
                >
                  {lines.map((line, i) => (
                    <div key={i} className="flex hover:bg-white/5">
                      <span
                        className="select-none text-right flex-shrink-0 px-3 py-0"
                        style={{
                          color: "var(--text-muted)",
                          width: "48px",
                          opacity: 0.5,
                          borderRight: "1px solid var(--border-subtle)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="px-4 whitespace-pre">{line}</span>
                    </div>
                  ))}
                </pre>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div className="text-sm">Select a file to view</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
