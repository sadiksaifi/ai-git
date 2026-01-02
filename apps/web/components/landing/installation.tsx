import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./code-block";

export function Installation() {
  return (
    <section
      id="installation"
      className="border-y border-border bg-muted/30 px-4 py-24 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-3xl">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Installation
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get started in seconds
          </p>
        </div>

        {/* Installation Tabs */}
        <Tabs defaultValue="homebrew" className="w-full">
          <TabsList className="mx-auto mb-8 grid w-fit grid-cols-2">
            <TabsTrigger value="homebrew">Homebrew</TabsTrigger>
            <TabsTrigger value="source">Build from Source</TabsTrigger>
          </TabsList>

          <TabsContent value="homebrew" className="space-y-4">
            <CodeBlock
              code={`brew tap sadiksaifi/tap
brew install ai-git`}
              language="bash"
            />
            <p className="text-center text-sm text-muted-foreground">
              Recommended for macOS users
            </p>
          </TabsContent>

          <TabsContent value="source" className="space-y-4">
            <CodeBlock
              code={`git clone https://github.com/sadiksaifi/ai-git.git
cd ai-git
bun install
bun run build`}
              language="bash"
            />
            <p className="text-center text-sm text-muted-foreground">
              Requires Bun runtime installed
            </p>
          </TabsContent>
        </Tabs>

        {/* First Run */}
        <div className="mt-12 text-center">
          <h3 className="mb-4 text-lg font-semibold">First Run</h3>
          <p className="mb-4 text-muted-foreground">
            After installation, simply run the command to start the interactive
            setup:
          </p>
          <CodeBlock code="ai-git" language="bash" />
        </div>
      </div>
    </section>
  );
}
