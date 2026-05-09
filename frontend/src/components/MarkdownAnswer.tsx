import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownAnswer({ content }: { content: string }) {
  const components: Components = {
    p: ({ children, ...props }) => (
      <p className="my-2 leading-relaxed" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="my-2 list-disc pl-6" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-2 list-decimal pl-6" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="my-1" {...props}>
        {children}
      </li>
    ),
    code: ({ className, children, ...props }) => {
      const isBlock = typeof className === "string" && className.includes("language-");
      if (isBlock) {
        // For fenced code blocks, <pre> handles styling; keep <code> minimal.
        return (
          <code className="font-mono text-xs" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre
        className="my-3 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
        {...props}
      >
        {children}
      </pre>
    ),
  };

  return (
    <div className="prose prose-sm max-w-none text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

