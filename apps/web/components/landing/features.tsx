import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  File01Icon,
  CodeIcon,
  FloppyDiskIcon,
  SettingsIcon,
  ShieldIcon,
} from "@hugeicons/core-free-icons";

const features = [
  {
    icon: ComputerIcon,
    title: "AI-Powered",
    description:
      "Analyzes diffs and understands the semantic intent behind your code changes.",
  },
  {
    icon: File01Icon,
    title: "Conventional Commits",
    description:
      "Strictly adheres to v1.0.0 specification with 50-character header limits.",
  },
  {
    icon: CodeIcon,
    title: "Interactive TUI",
    description:
      "Beautiful terminal UI for staging, editing, and confirming your commits.",
  },
  {
    icon: FloppyDiskIcon,
    title: "Token Efficient",
    description:
      "Uses TOON format to minimize prompt size and reduce API costs.",
  },
  {
    icon: SettingsIcon,
    title: "Multiple Providers",
    description:
      "Claude Code, Gemini CLI, Codex, OpenRouter, OpenAI, Anthropic, Google AI Studio, and Cerebras.",
  },
  {
    icon: ShieldIcon,
    title: "Secure Storage",
    description:
      "API keys stored in macOS Keychain, never in config files.",
  },
];

export function Features() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Features
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need for perfect commit messages
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="group transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <HugeiconsIcon
                    icon={feature.icon}
                    className="size-5 text-primary"
                    strokeWidth={2}
                  />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
