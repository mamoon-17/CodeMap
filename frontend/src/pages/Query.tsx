import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Search,
  RefreshCw,
  Send,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  getProjectFileContent,
  getProjectFiles,
  queryCodebase,
} from "@/services/api";
import type { ProjectContextItem, Source } from "@/types/api";
import { LogoHomeLink } from "@/components/LogoHomeLink";
import { MarkdownAnswer } from "@/components/MarkdownAnswer";

const ACTIVE_PROJECT_ID_KEY = "activeProjectId";
const ACTIVE_PROJECT_NAME_KEY = "activeProjectName";
const PROJECT_CONTEXTS_KEY = "projectContexts";
const CHAT_HISTORY_KEY_PREFIX = "chatHistory_";
const MAX_STORED_MESSAGES = 50;
const FILE_TREE_MIN_WIDTH = 180;
const FILE_TREE_DEFAULT_WIDTH = 224;
const FILE_TREE_MAX_WIDTH = 640;

const getChatStorageKey = (projectId: string) =>
  `${CHAT_HISTORY_KEY_PREFIX}${projectId}`;

const persistMessages = (projectId: string, messages: Message[]) => {
  if (!projectId) return;
  try {
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(getChatStorageKey(projectId), JSON.stringify(toStore));
  } catch {
    // localStorage may be unavailable (private mode) or full (QuotaExceededError);
    // fail silently so the chat keeps working even if persistence is degraded.
  }
};

function isValidMessage(m: unknown): m is Message {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  return (
    typeof msg.id === "string" &&
    (msg.role === "user" || msg.role === "ai") &&
    typeof msg.content === "string"
  );
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  tool_used?: boolean;
  references?: {
    file: string;
    lines: string;
    snippet: string;
    score?: number;
  }[];
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
}

const sortTreeNodes = (nodes: TreeNode[]) =>
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

const buildFileTree = (filePaths: string[]): TreeNode[] => {
  const root: TreeNode[] = [];

  for (const filePath of filePaths) {
    const parts = filePath.split(/[\\/]+/).filter(Boolean);
    let currentLevel = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = currentLevel.find(
        (item) => item.name === part && item.type === (isFile ? "file" : "folder"),
      );

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: [],
        };
        currentLevel.push(node);
      }

      currentLevel = node.children;
    });
  }

  const sortRecursively = (nodes: TreeNode[]) => {
    sortTreeNodes(nodes);
    nodes.forEach((node) => sortRecursively(node.children));
  };

  sortRecursively(root);
  return root;
};

const getAncestorFolderPaths = (filePath: string) => {
  const parts = filePath.split(/[\\/]+/).filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
};

const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  const folderMatches = nodes
    .map((node) => {
      if (node.type !== "folder") return null;
      if (node.name.toLowerCase().includes(normalizedQuery)) return node;

      const children = filterTree(node.children, normalizedQuery);
      if (children.length === 0) return null;
      return { ...node, children };
    })
    .filter((node): node is TreeNode => node !== null);

  if (folderMatches.length > 0) return folderMatches;

  return nodes
    .map((node) => {
      const children = filterTree(node.children, normalizedQuery);
      const matches =
        node.type === "file" &&
        node.name.toLowerCase().includes(normalizedQuery) ||
        (node.type === "file" &&
          node.path.toLowerCase().includes(normalizedQuery));

      if (!matches && children.length === 0) return null;
      return {
        ...node,
        children,
      };
    })
    .filter((node): node is TreeNode => node !== null);
};

const countFiles = (nodes: TreeNode[]): number =>
  nodes.reduce(
    (total, node) =>
      total + (node.type === "file" ? 1 : countFiles(node.children)),
    0,
  );

const collectFolderPaths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((node) =>
    node.type === "folder"
      ? [node.path, ...collectFolderPaths(node.children)]
      : [],
  );

const HighlightedTreeLabel = ({
  label,
  query,
}: {
  label: string;
  query: string;
}) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return <>{label}</>;

  const matchIndex = label.toLowerCase().indexOf(normalizedQuery);
  if (matchIndex === -1) return <>{label}</>;

  const before = label.slice(0, matchIndex);
  const match = label.slice(matchIndex, matchIndex + normalizedQuery.length);
  const after = label.slice(matchIndex + normalizedQuery.length);

  return (
    <>
      {before}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {match}
      </mark>
      {after}
    </>
  );
};

const FileTreeItem = memo(({
  node,
  depth = 0,
  onSelect,
  onToggle,
  expandedFolders,
  selectedFilePath,
  isOpening,
  selectedItemRef,
  searchQuery,
}: {
  node: TreeNode;
  depth?: number;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  expandedFolders: Set<string>;
  selectedFilePath: string | null;
  isOpening: boolean;
  selectedItemRef: RefObject<HTMLButtonElement | null>;
  searchQuery: string;
}) => {
  if (node.type === "file") {
    const selected = selectedFilePath === node.path;
    const matchesSearch =
      searchQuery.trim().length > 0 &&
      node.path.toLowerCase().includes(searchQuery.trim().toLowerCase());

    return (
      <button
        ref={selected ? selectedItemRef : undefined}
        onClick={() => onSelect(node.path)}
        disabled={isOpening}
        className={`flex w-full items-center gap-1.5 rounded-sm py-1 pr-2 text-left text-xs transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-wait ${
          selected
            ? "bg-secondary text-foreground"
            : matchesSearch
              ? "bg-primary/5 text-foreground"
            : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <File
          size={13}
          className={`shrink-0 ${selected ? "text-primary" : "text-muted-foreground/60"}`}
        />
        <span className="truncate font-mono">
          <HighlightedTreeLabel label={node.name} query={searchQuery} />
        </span>
        {selected && isOpening && (
          <Loader2 size={12} className="ml-auto shrink-0 animate-spin" />
        )}
      </button>
    );
  }

  const open = expandedFolders.has(node.path);

  return (
    <div>
      <button
        onClick={() => onToggle(node.path)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-sm py-1 pr-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {open ? (
          <>
            <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            <FolderOpen size={13} className="shrink-0 text-primary/70" />
          </>
        ) : (
          <>
            <ChevronRight
              size={13}
              className="shrink-0 text-muted-foreground"
            />
            <Folder size={13} className="shrink-0 text-primary/70" />
          </>
        )}
        <span className="truncate">
          <HighlightedTreeLabel label={node.name} query={searchQuery} />
        </span>
      </button>
      {open &&
        node.children?.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            onToggle={onToggle}
            expandedFolders={expandedFolders}
            selectedFilePath={selectedFilePath}
            isOpening={isOpening}
            selectedItemRef={selectedItemRef}
            searchQuery={searchQuery}
          />
        ))}
    </div>
  );
});

FileTreeItem.displayName = "FileTreeItem";

const Query = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const projectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "";
    if (!projectId) return [];
    try {
      const stored = localStorage.getItem(getChatStorageKey(projectId));
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter(isValidMessage) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [selectedRef, setSelectedRef] = useState<{
    file: string;
    lines: string;
    snippet: string;
    score?: number;
  } | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [showFileTree, setShowFileTree] = useState(true);
  const [fileTreeWidth, setFileTreeWidth] = useState(FILE_TREE_DEFAULT_WIDTH);
  const [codePanelWidth, setCodePanelWidth] = useState(400);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [queryProjectId, setQueryProjectId] = useState(
    localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "",
  );
  const [activeProjectName, setActiveProjectName] = useState(
    localStorage.getItem(ACTIVE_PROJECT_NAME_KEY) || "",
  );
  const [projects, setProjects] = useState<ProjectContextItem[]>([]);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const deferredFileFilter = useDeferredValue(fileFilter);
  const selectedTreeItemRef = useRef<HTMLButtonElement | null>(null);

  const filteredFileTree = useMemo(
    () => filterTree(fileTree, deferredFileFilter),
    [fileTree, deferredFileFilter],
  );
  const visibleFileCount = useMemo(
    () => countFiles(filteredFileTree),
    [filteredFileTree],
  );
  const isFilteringFiles = deferredFileFilter.trim().length > 0;

  useEffect(() => {
    if (!queryProjectId) {
      setMessages([]);
      return;
    }
    try {
      const stored = localStorage.getItem(getChatStorageKey(queryProjectId));
      if (!stored) {
        setMessages([]);
        return;
      }
      const parsed = JSON.parse(stored);
      const valid = Array.isArray(parsed) ? parsed.filter(isValidMessage) : [];
      setMessages(valid);
    } catch {
      setMessages([]);
    }
  }, [queryProjectId]);

  useEffect(() => {
    const raw = localStorage.getItem(PROJECT_CONTEXTS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as ProjectContextItem[];
      setProjects(parsed);
    } catch {
      setProjects([]);
    }
  }, []);

  const updateActiveProject = (nextProjectId: string) => {
    const matched = projects.find((project) => project.id === nextProjectId);
    const nextProjectName = matched?.name || nextProjectId;

    setQueryProjectId(nextProjectId);
    setActiveProjectName(nextProjectName);
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, nextProjectId);
    localStorage.setItem(ACTIVE_PROJECT_NAME_KEY, nextProjectName);
  };

  const loadProjectFiles = useCallback(async (nextProjectId: string) => {
    const trimmedProjectId = nextProjectId.trim();
    if (!trimmedProjectId) {
      setFileTree([]);
      return;
    }

    setIsFileTreeLoading(true);
    setFileTreeError(null);

    try {
      const response = await getProjectFiles(trimmedProjectId);
      const nextTree = buildFileTree(response.files);
      setFileTree(nextTree);
      setExpandedFolders((prev) => {
        if (prev.size > 0) return prev;
        return new Set(nextTree.filter((node) => node.type === "folder").map((node) => node.path));
      });
    } catch (error) {
      setFileTree([]);
      setFileTreeError(
        error instanceof Error ? error.message : "Failed to load repository files",
      );
    } finally {
      setIsFileTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjectFiles(queryProjectId);
  }, [queryProjectId, loadProjectFiles]);

  const syncTreeToActiveFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      getAncestorFolderPaths(path).forEach((folderPath) => next.add(folderPath));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedRef?.file) return;
    syncTreeToActiveFile(selectedRef.file);
  }, [selectedRef?.file, syncTreeToActiveFile]);

  useEffect(() => {
    if (!isFilteringFiles) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      collectFolderPaths(filteredFileTree).forEach((folderPath) =>
        next.add(folderPath),
      );
      return next;
    });
  }, [deferredFileFilter, filteredFileTree, isFilteringFiles]);

  useEffect(() => {
    if (!selectedFilePath || !showFileTree) return;
    selectedTreeItemRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedFilePath, showFileTree, expandedFolders, filteredFileTree]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const openFileFromTree = useCallback(async (path: string) => {
    const trimmedProjectId = queryProjectId.trim();
    if (!trimmedProjectId || isOpeningFile) return;

    syncTreeToActiveFile(path);
    setOpenFileError(null);
    setIsOpeningFile(true);

    try {
      const response = await getProjectFileContent(trimmedProjectId, path);
      setSelectedRef({
        file: response.file_path,
        lines:
          response.chunks.length === 1
            ? `Lines ${response.chunks[0].start_line}-${response.chunks[0].end_line}`
            : `${response.chunks.length} indexed chunks`,
        snippet: response.content || "(Indexed file has no displayable content.)",
      });
      setShowCodePanel(true);
    } catch (error) {
      setOpenFileError(
        error instanceof Error ? error.message : "Failed to open indexed file",
      );
    } finally {
      setIsOpeningFile(false);
    }
  }, [isOpeningFile, queryProjectId, syncTreeToActiveFile]);

  const handleMouseMoveLeft = useCallback(
    (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(
          FILE_TREE_MIN_WIDTH,
          Math.min(FILE_TREE_MAX_WIDTH, e.clientX),
        );
        setFileTreeWidth(newWidth);
      }
    },
    [isResizingLeft],
  );

  const handleMouseMoveRight = useCallback(
    (e: MouseEvent) => {
      if (isResizingRight) {
        const newWidth = Math.max(
          300,
          Math.min(800, window.innerWidth - e.clientX),
        );
        setCodePanelWidth(newWidth);
      }
    },
    [isResizingRight],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  useEffect(() => {
    if (isResizingLeft) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMoveLeft);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMoveLeft);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizingLeft, handleMouseMoveLeft, handleMouseUp]);

  useEffect(() => {
    if (isResizingRight) {
      document.addEventListener("mousemove", handleMouseMoveRight);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMoveRight);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizingRight, handleMouseMoveRight, handleMouseUp]);

  const handleSend = async () => {
    if (!input.trim() || !queryProjectId.trim() || isLoading) return;

    updateActiveProject(queryProjectId.trim());

    const userMsg: Message = {
      id: String(Date.now()),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    const queryText = input;
    setInput("");
    setIsLoading(true);

    try {
      const response = await queryCodebase({
        project_id: queryProjectId.trim(),
        query: queryText,
        top_k: 5,
      });

      // Map backend sources to UI references format
      const references = response.sources?.map((source: Source) => ({
        file: source.file,
        lines: `Chunk ${source.chunk_index}`,
        snippet: source.text,
        score: source.score,
      }));

      const aiMsg: Message = {
        id: String(Date.now() + 1),
        role: "ai",
        content: response.answer,
        tool_used: response.tool_used,
        references,
      };

      setMessages((prev) => {
        const updated = [...prev, aiMsg];
        persistMessages(queryProjectId, updated);
        return updated;
      });

      // Auto-select first reference if available
      if (references && references.length > 0) {
        setSelectedRef(references[0]);
        setShowCodePanel(true);
      }
    } catch (error) {
      const errorMsg: Message = {
        id: String(Date.now() + 1),
        role: "ai",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response from backend"}`,
      };
      setMessages((prev) => {
        const updated = [...prev, errorMsg];
        persistMessages(queryProjectId, updated);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Navbar */}
      <nav className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <LogoHomeLink />
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium text-foreground font-mono">
              Query Interface
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-xs text-muted-foreground truncate max-w-[220px]">
              {activeProjectName || "No project selected"}
            </span>
          </div>
          <Link
            to="/dashboard"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Dashboard
          </Link>
        </div>
      </nav>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File Tree */}
        {showFileTree && (
          <aside
            className="relative flex shrink-0 flex-col border-r bg-card"
            style={{ width: `${fileTreeWidth}px` }}
          >
            <div className="shrink-0 border-b p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Files
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => loadProjectFiles(queryProjectId)}
                    disabled={isFileTreeLoading || !queryProjectId.trim()}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                    title="Refresh file tree"
                  >
                    <RefreshCw
                      size={13}
                      className={isFileTreeLoading ? "animate-spin" : undefined}
                    />
                  </button>
                  <button
                    onClick={() => setShowFileTree(false)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                    title="Close sidebar"
                  >
                    <PanelLeftClose size={13} />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="Filter files…"
                  className="w-full rounded border bg-background py-1 pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {fileFilter && (
                  <button
                    type="button"
                    onClick={() => setFileFilter("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Clear file filter"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {!isFileTreeLoading && fileTree.length > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {isFilteringFiles
                    ? `${visibleFileCount} matching indexed files`
                    : `${visibleFileCount} indexed files`}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {openFileError && (
                <div className="px-3 py-2 text-xs text-destructive">
                  {openFileError}
                </div>
              )}
              {isFileTreeLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" />
                  Loading files...
                </div>
              ) : fileTreeError ? (
                <div className="px-3 py-2 text-xs text-destructive">
                  {fileTreeError}
                </div>
              ) : fileTree.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No indexed files found for this project.
                </div>
              ) : filteredFileTree.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No files match this filter.
                </div>
              ) : (
                filteredFileTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    onSelect={openFileFromTree}
                    onToggle={toggleFolder}
                    expandedFolders={expandedFolders}
                    selectedFilePath={selectedFilePath}
                    isOpening={isOpeningFile}
                    selectedItemRef={selectedTreeItemRef}
                    searchQuery={deferredFileFilter}
                  />
                ))
              )}
            </div>
            <button
              type="button"
              aria-label="Resize file tree sidebar"
              className="group absolute -right-1 top-0 z-20 flex h-full w-2 cursor-col-resize items-center justify-center"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizingLeft(true);
              }}
              onDoubleClick={() => setFileTreeWidth(FILE_TREE_DEFAULT_WIDTH)}
            >
              <span className="h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
            </button>
          </aside>
        )}

        {/* Center: Chat */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Search / Input */}
          <div className="border-b p-4">
            <div className="flex items-center gap-2">
              {!showFileTree && (
                <button
                  onClick={() => setShowFileTree(true)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                  title="Show sidebar"
                >
                  <PanelLeftOpen size={16} />
                </button>
              )}
              {messages.length > 0 && !isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    if (queryProjectId) {
                      localStorage.removeItem(getChatStorageKey(queryProjectId));
                    }
                  }}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                  title="Clear chat history"
                >
                  <X size={16} />
                </button>
              )}
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={
                    queryProjectId.trim()
                      ? `Ask about ${activeProjectName}...`
                      : "Select a repository from the dashboard, then ask about your codebase..."
                  }
                  disabled={isLoading}
                  className="w-full rounded-md border bg-card py-2.5 pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={
                    isLoading || !input.trim() || !queryProjectId.trim()
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
              {!showCodePanel && selectedRef && (
                <button
                  onClick={() => setShowCodePanel(true)}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                  title="Show code panel"
                >
                  <PanelRightOpen size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className="animate-fade-in">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-medium ${
                      msg.role === "user"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-relaxed">
                      <MarkdownAnswer content={msg.content} />
                    </div>

                    {msg.tool_used !== undefined && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {msg.tool_used
                          ? "🔍 Retrieved from codebase"
                          : "💡 Answered from knowledge"}
                      </div>
                    )}

                    {msg.references && (
                      <div className="mt-3 space-y-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Referenced files
                        </span>
                        {msg.references.map((ref) => (
                          <button
                            key={ref.file + ref.lines}
                            onClick={() => {
                              setSelectedRef(ref);
                              setShowCodePanel(true);
                            }}
                            className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-secondary group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <File
                                size={13}
                                className="text-primary/70 shrink-0"
                              />
                              <span className="text-xs font-mono text-foreground truncate">
                                {ref.file}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {ref.score && (
                                <span className="text-xs text-muted-foreground">
                                  {ref.score.toFixed(3)}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {ref.lines}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-medium text-primary">
                    AI
                  </div>
                  <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: "120ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                      style={{ animationDelay: "240ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right: Code Viewer */}
        {showCodePanel && selectedRef && (
          <aside
            className="shrink-0 border-l bg-card overflow-hidden flex flex-col relative"
            style={{ width: `${codePanelWidth}px` }}
          >
            {/* Resize handle */}
            <div
              className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors z-10"
              onMouseDown={() => setIsResizingRight(true)}
            />
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <File size={13} className="shrink-0 text-primary/70" />
                <span className="text-xs font-mono text-foreground truncate">
                  {selectedRef.file}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {selectedRef.lines}
                </span>
                {selectedRef.score && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    Score: {selectedRef.score.toFixed(3)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(selectedRef.snippet)
                  }
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                  title="Copy"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => setShowCodePanel(false)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                  title="Close panel"
                >
                  <PanelRightClose size={13} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="text-xs leading-relaxed font-mono">
                {selectedRef.snippet.split("\n").map((line, i) => (
                  <div
                    key={i}
                    className="flex hover:bg-secondary/50 -mx-4 px-4 py-px"
                  >
                    <span className="mr-4 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/50">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-foreground wrap-break-word whitespace-pre-wrap">
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default Query;
