import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TerminalDemo } from "./terminal-demo";
import { HugeiconsIcon } from "@hugeicons/react";
import { Github01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-16 sm:px-6 lg:px-8">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
        {/* Badge */}
        <Badge
          variant="secondary"
          className="animate-fade-in-up px-4 py-1.5 text-sm"
        >
          AI-Powered Git Commits
        </Badge>

        {/* Headline */}
        <h1 className="animate-fade-in-up animation-delay-100 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
            AI Git
          </span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-in-up animation-delay-200 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Generate semantically correct,{" "}
          <span className="text-foreground">Conventional Commits-compliant</span>{" "}
          git commit messages with AI. Analyze your changes, understand your
          intent, commit automatically.
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-in-up animation-delay-300 flex flex-col gap-4 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="#installation" className="flex items-center gap-2">
              Get Started
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-4"
                strokeWidth={2}
              />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a
              href="https://github.com/sadiksaifi/ai-git"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <HugeiconsIcon
                icon={Github01Icon}
                className="size-4"
                strokeWidth={2}
              />
              View on GitHub
            </a>
          </Button>
        </div>

        {/* Terminal Demo */}
        <div className="animate-fade-in-up animation-delay-400 mt-8 w-full">
          <TerminalDemo />
        </div>
      </div>
    </section>
  );
}
