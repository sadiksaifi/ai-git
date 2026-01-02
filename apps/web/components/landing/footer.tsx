import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Github01Icon } from "@hugeicons/core-free-icons";

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">
              <span className="text-primary">AI</span> Git
            </span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/sadiksaifi/ai-git"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={Github01Icon}
                className="size-4"
                strokeWidth={2}
              />
              GitHub
            </a>
            <a
              href="https://github.com/sadiksaifi/ai-git/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              MIT License
            </a>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            Built by{" "}
            <a
              href="https://sadiksaifi.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Sadik Saifi
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
