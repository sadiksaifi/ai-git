"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language = "bash",
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border bg-muted/50 font-mono text-sm",
        className
      )}
    >
      {language && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">{language}</span>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Copy code"
          >
            <HugeiconsIcon
              icon={copied ? Tick01Icon : Copy01Icon}
              className="size-4"
              strokeWidth={2}
            />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="mr-4 select-none text-muted-foreground">
                  {String(i + 1).padStart(2, " ")}
                </span>
              )}
              <span>{line}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
