"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Reusable terminal UI components using CSS
function Box({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-muted-foreground/30 rounded-sm", className)}>
      {title && (
        <div className="px-3 py-1 border-b border-muted-foreground/30 text-muted-foreground">
          {title}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function WelcomeHeader() {
  return (
    <div className="border border-muted-foreground/30 rounded-sm mb-2">
      <div className="px-3 py-1 border-b border-muted-foreground/30 text-muted-foreground text-xs">
        AI Git v2.0.0
      </div>
      <div className="grid grid-cols-2 divide-x divide-muted-foreground/30">
        {/* Left column */}
        <div className="p-4 flex flex-col items-center justify-center gap-2">
          <pre className="text-primary text-center text-xs leading-none">
{`▄▀█ █   ▄▄ █▀▀ █ ▀█▀
█▀█ █   ░░ █▄█ █ ░█░`}
          </pre>
          <div className="text-center text-sm">Welcome to AI Git!</div>
          <div className="text-center text-muted-foreground text-xs">~/projects/my-app</div>
        </div>
        {/* Right column */}
        <div className="p-3 text-xs">
          <div className="font-medium mb-2">Features:</div>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Conventional Commits format</li>
            <li>• Smart scope detection</li>
            <li>• Interactive refinement</li>
          </ul>
          <div className="mt-3 pt-2 border-t border-muted-foreground/30">
            <div className="font-medium">Tip: ai-git --dry-run</div>
            <div className="text-muted-foreground">Print the prompt without calling AI</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StagedFiles({ files }: { files: string[] }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground">◇</span>
        <span>Staged Files</span>
      </div>
      <Box>
        <div className="space-y-0.5">
          {files.map((file) => (
            <div key={file}>
              <span className="text-green-400">+</span> {file}
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}

function CommitMessage({ title, body }: { title: string; body: string[] }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground">◇</span>
        <span>Generated Commit Message</span>
      </div>
      <Box>
        <div className="text-primary font-semibold mb-2">{title}</div>
        <div className="space-y-0.5 text-muted-foreground">
          {body.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </Box>
    </div>
  );
}

function ActionMenu({ selected }: { selected: number }) {
  const options = ["Commit", "Edit", "Refine with AI", "Regenerate", "Cancel"];
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">◆</span>
        <span>Action</span>
      </div>
      <div className="pl-4 space-y-0.5">
        {options.map((opt, i) => (
          <div key={opt} className={i === selected ? "text-primary" : "text-muted-foreground"}>
            {i === selected ? "●" : "○"} {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

function Spinner({ text, char }: { text: string; char: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{char}</span>
      <span>{text}</span>
    </div>
  );
}

function Success({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-green-400">◆</span>
      <span>{text}</span>
    </div>
  );
}

function Completed({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">◇</span>
        <span>{label}</span>
      </div>
      <div className="pl-4 text-muted-foreground">{value}</div>
    </div>
  );
}

function Confirm({ question, selected }: { question: string; selected: "yes" | "no" }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <span className="text-primary">◆</span>
        <span>{question}</span>
      </div>
      <div className="pl-4">
        <span className={selected === "yes" ? "text-primary" : "text-muted-foreground"}>
          {selected === "yes" ? "●" : "○"} Yes
        </span>
        {" / "}
        <span className={selected === "no" ? "text-primary" : "text-muted-foreground"}>
          {selected === "no" ? "●" : "○"} No
        </span>
      </div>
    </div>
  );
}

function VerticalLine() {
  return <div className="text-muted-foreground/50 pl-0.5 mb-2">│</div>;
}

// Data
const files = ["src/auth/oauth.ts", "src/auth/session.ts", "src/utils/tokens.ts"];
const commitTitle = "feat(auth): add OAuth2 login flow";
const commitBody = [
  "- implement Google OAuth provider",
  "- add session token management",
  "- create login/logout endpoints",
];

// Frame components
function Frame1() {
  return (
    <>
      <WelcomeHeader />
      <VerticalLine />
    </>
  );
}

function Frame2() {
  return (
    <>
      <WelcomeHeader />
      <VerticalLine />
      <StagedFiles files={files} />
      <VerticalLine />
    </>
  );
}

function Frame3({ spinChar }: { spinChar: string }) {
  return (
    <>
      <WelcomeHeader />
      <VerticalLine />
      <StagedFiles files={files} />
      <VerticalLine />
      <Spinner text="Analyzing changes with Claude Haiku" char={spinChar} />
    </>
  );
}

function Frame4() {
  return (
    <>
      <VerticalLine />
      <StagedFiles files={files} />
      <VerticalLine />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">◇</span>
        <span>Message generated</span>
      </div>
      <VerticalLine />
      <CommitMessage title={commitTitle} body={commitBody} />
      <VerticalLine />
      <ActionMenu selected={0} />
    </>
  );
}

function Frame5() {
  return (
    <>
      <VerticalLine />
      <CommitMessage title={commitTitle} body={commitBody} />
      <VerticalLine />
      <Completed label="Action" value="Commit" />
      <VerticalLine />
      <Success text="Commit created successfully." />
      <VerticalLine />
      <Confirm question="Do you want to git push?" selected="yes" />
    </>
  );
}

function Frame6({ spinChar }: { spinChar: string }) {
  return (
    <>
      <VerticalLine />
      <CommitMessage title={commitTitle} body={commitBody} />
      <VerticalLine />
      <Completed label="Action" value="Commit" />
      <VerticalLine />
      <Success text="Commit created successfully." />
      <VerticalLine />
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">◇</span>
          <span>Do you want to git push?</span>
        </div>
        <div className="pl-4 text-muted-foreground">Yes</div>
      </div>
      <VerticalLine />
      <Spinner text="Pushing to origin" char={spinChar} />
    </>
  );
}

function Frame7() {
  return (
    <>
      <VerticalLine />
      <CommitMessage title={commitTitle} body={commitBody} />
      <VerticalLine />
      <Completed label="Action" value="Commit" />
      <VerticalLine />
      <Success text="Commit created successfully." />
      <VerticalLine />
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">◇</span>
          <span>Do you want to git push?</span>
        </div>
        <div className="pl-4 text-muted-foreground">Yes</div>
      </div>
      <VerticalLine />
      <Success text="Done" />
    </>
  );
}

const frameComponents = [Frame1, Frame2, Frame3, Frame4, Frame5, Frame6, Frame7];
const frameDelays = [0, 1200, 2400, 4000, 6500, 8000, 9500];

const SPIN_CHARS = ["◐", "◓", "◑", "◒"];

export function TerminalDemo({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);
  const [spinChar, setSpinChar] = useState("◒");
  const ref = useRef<HTMLDivElement>(null);
  const isFirstFrame = frame === 0;

  // Auto-scroll
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [frame]);

  // Frame transitions
  useEffect(() => {
    const timers = frameDelays.map((delay, i) =>
      i > 0 ? setTimeout(() => setFrame(i), delay) : null
    ).filter(Boolean) as NodeJS.Timeout[];

    const reset = setTimeout(() => setFrame(0), 12000);
    timers.push(reset);

    return () => timers.forEach(clearTimeout);
  }, [isFirstFrame]);

  // Spinner
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % SPIN_CHARS.length;
      setSpinChar(SPIN_CHARS[i]);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const FrameComponent = frameComponents[frame];

  return (
    <div
      className={cn(
        "w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card text-left",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <div className="size-3 rounded-full bg-red-500/80" />
        <div className="size-3 rounded-full bg-yellow-500/80" />
        <div className="size-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-muted-foreground">Terminal — ai-git</span>
      </div>
      <div
        ref={ref}
        className="h-[380px] overflow-y-auto overflow-x-auto p-4 font-mono text-xs sm:text-sm scroll-smooth"
      >
        <FrameComponent spinChar={spinChar} />
      </div>
    </div>
  );
}
