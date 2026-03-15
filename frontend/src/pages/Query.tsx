import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { ingestCodebase, queryCodebase } from "@/services/api";
import type { Source } from "@/types/api";

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
  type: "file" | "folder";
  children?: TreeNode[];
}

const fileTree: TreeNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "modules",
        type: "folder",
        children: [
          { name: "query.service.ts", type: "file" },
          { name: "query.controller.ts", type: "file" },
          { name: "query.routes.ts", type: "file" },
        ],
      },
      {
        name: "config",
        type: "folder",
        children: [
          { name: "config.ts", type: "file" },
          { name: "datasource.ts", type: "file" },
        ],
      },
      { name: "app.ts", type: "file" },
      { name: "server.ts", type: "file" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
];

const FileTreeItem = ({
  node,
  depth = 0,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  onSelect: (name: string) => void;
}) => {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === "file") {
    return (
      <button
        onClick={() => onSelect(node.name)}
        className="flex w-full items-center gap-1.5 rounded-sm py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <File size={13} className="shrink-0 text-muted-foreground/60" />
        <span className="truncate font-mono">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
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
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        node.children?.map((child) => (
          <FileTreeItem
            key={child.name}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
};

const Query = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedRef, setSelectedRef] = useState<{
    file: string;
    lines: string;
    snippet: string;
    score?: number;
  } | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [showFileTree, setShowFileTree] = useState(true);
  const [fileTreeWidth, setFileTreeWidth] = useState(224);
  const [codePanelWidth, setCodePanelWidth] = useState(400);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectId, setProjectId] = useState("manual-project");
  const [queryProjectId, setQueryProjectId] = useState("manual-project");
  const [filePath, setFilePath] = useState("src/manual_test.py");
  const [fileContent, setFileContent] = useState(
    [
      "def manual_test_helper():",
      '    """Manual ingest test helper."""',
      '    return "manual-ingest-marker"',
    ].join("\n"),
  );
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  const handleMouseMoveLeft = useCallback(
    (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(180, Math.min(500, e.clientX));
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
      document.addEventListener("mousemove", handleMouseMoveLeft);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
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

      setMessages((prev) => [...prev, aiMsg]);

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
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!fileContent.trim() || !filePath.trim() || isIngesting) return;

    setIngestStatus(null);
    setIsIngesting(true);

    try {
      const response = await ingestCodebase({
        project_id: projectId.trim() || "manual-project",
        replace_project: true,
        files: [
          {
            file_path: filePath.trim(),
            content: fileContent,
          },
        ],
      });

      setIngestStatus(
        `Ingested successfully. Indexed chunks: ${response.indexed}`,
      );
      setQueryProjectId(projectId.trim() || "manual-project");
    } catch (error) {
      setIngestStatus(
        `Ingest failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Navbar */}
      <nav className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <span className="text-xs font-bold text-primary-foreground font-mono">
                  &lt;/&gt;
                </span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                CodeMap
              </span>
            </div>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium text-foreground font-mono">
              Query Interface
            </span>
          </div>
        </div>
      </nav>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File Tree */}
        {showFileTree && (
          <aside
            className="shrink-0 border-r bg-card overflow-y-auto relative"
            style={{ width: `${fileTreeWidth}px` }}
          >
            <div className="p-3 border-b">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Files
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
                    title="Re-index"
                  >
                    <RefreshCw size={13} />
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
                  placeholder="Filter files…"
                  className="w-full rounded border bg-background py-1 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="py-1">
              {fileTree.map((node) => (
                <FileTreeItem key={node.name} node={node} onSelect={() => {}} />
              ))}
            </div>
            {/* Resize handle */}
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors"
              onMouseDown={() => setIsResizingLeft(true)}
            />
          </aside>
        )}

        {/* Center: Chat */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Search / Input */}
          <div className="border-b p-4">
            <div className="mb-4 rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Manual Ingest (RAG)
                </span>
                <button
                  onClick={handleIngest}
                  disabled={
                    isIngesting || !filePath.trim() || !fileContent.trim()
                  }
                  className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isIngesting ? "Ingesting..." : "Ingest File"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="Project ID"
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="File path (e.g. src/foo.py)"
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                rows={6}
                placeholder="Paste full file content here"
                className="mt-2 w-full rounded border bg-background px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />

              {ingestStatus && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {ingestStatus}
                </p>
              )}
            </div>

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
              <input
                type="text"
                value={queryProjectId}
                onChange={(e) => setQueryProjectId(e.target.value)}
                placeholder="Query Project ID"
                className="w-44 rounded-md border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
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
                      ? `Ask about project ${queryProjectId.trim()}...`
                      : "Set Query Project ID, then ask about your codebase..."
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
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>

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
                            className="flex w-full items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-secondary group"
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
                              <span className="text-xs text-muted-foreground">
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
