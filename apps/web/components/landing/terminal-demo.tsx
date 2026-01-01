"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const terminalLines = [
  { text: "$ ai-git", delay: 0, type: "command" },
  { text: "", delay: 800, type: "empty" },
  { text: "Analyzing staged changes...", delay: 1000, type: "status" },
  { text: "Generating commit message...", delay: 1800, type: "status" },
  { text: "", delay: 2400, type: "empty" },
  {
    text: "feat(auth): add OAuth2 login flow",
    delay: 2600,
    type: "commit-title",
  },
  { text: "", delay: 2800, type: "empty" },
  { text: "- implement Google OAuth provider", delay: 3000, type: "commit-body" },
  { text: "- add session token management", delay: 3200, type: "commit-body" },
  { text: "- create login/logout endpoints", delay: 3400, type: "commit-body" },
  { text: "", delay: 3600, type: "empty" },
  { text: "? Commit this message?", delay: 3800, type: "prompt" },
  { text: "  > Commit", delay: 4000, type: "option-selected" },
  { text: "    Edit", delay: 4000, type: "option" },
  { text: "    Cancel", delay: 4000, type: "option" },
];

export function TerminalDemo({ className }: { className?: string }) {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    terminalLines.forEach((line, index) => {
      const timer = setTimeout(() => {
        setVisibleLines(index + 1);
      }, line.delay);
      timers.push(timer);
    });

    // Cursor blink
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);

    // Reset animation after completion
    const resetTimer = setTimeout(() => {
      setVisibleLines(0);
      setTimeout(() => {
        terminalLines.forEach((line, index) => {
          setTimeout(() => {
            setVisibleLines(index + 1);
          }, line.delay);
        });
      }, 500);
    }, 8000);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(cursorInterval);
      clearTimeout(resetTimer);
    };
  }, []);

  return (
    <div
      className={cn(
        "w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card animate-glow",
        className
      )}
    >
      {/* Terminal Chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <div className="size-3 rounded-full bg-red-500/80" />
        <div className="size-3 rounded-full bg-yellow-500/80" />
        <div className="size-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-muted-foreground">Terminal</span>
      </div>

      {/* Terminal Content */}
      <div className="min-h-[280px] p-4 font-mono text-sm">
        {terminalLines.slice(0, visibleLines).map((line, index) => (
          <div
            key={index}
            className={cn("leading-relaxed", {
              "text-foreground":
                line.type === "command" || line.type === "prompt",
              "text-muted-foreground":
                line.type === "status" ||
                line.type === "commit-body" ||
                line.type === "option",
              "text-primary font-semibold": line.type === "commit-title",
              "text-primary": line.type === "option-selected",
              "h-5": line.type === "empty",
            })}
          >
            {line.text}
            {index === visibleLines - 1 &&
              line.type === "command" &&
              showCursor && (
                <span className="ml-0.5 inline-block h-4 w-2 bg-foreground animate-typewriter-cursor" />
              )}
          </div>
        ))}
        {visibleLines === 0 && (
          <div className="text-foreground">
            ${" "}
            {showCursor && (
              <span className="ml-0.5 inline-block h-4 w-2 bg-foreground animate-typewriter-cursor" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
