import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const providers = [
  {
    name: "Claude Code",
    type: "CLI",
    description: "Anthropic's Claude via local CLI",
  },
  {
    name: "Gemini CLI",
    type: "CLI",
    description: "Google's Gemini via local CLI",
  },
  {
    name: "OpenRouter",
    type: "API",
    description: "Access 100+ models via API",
  },
  {
    name: "OpenAI",
    type: "API",
    description: "GPT models via API",
  },
  {
    name: "Anthropic",
    type: "API",
    description: "Claude models via API",
  },
  {
    name: "Google AI Studio",
    type: "API",
    description: "Gemini models via API",
  },
];

export function Providers() {
  return (
    <section id="providers" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Supported Providers
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Choose from local CLI tools or cloud APIs
          </p>
        </div>

        {/* Provider Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <Card
              key={provider.name}
              className="group transition-all duration-300 hover:border-primary/30"
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    <Badge
                      variant={provider.type === "CLI" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {provider.type}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {provider.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Note */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          CLI providers work locally without API keys. API providers require
          keys stored securely in your macOS Keychain.
        </p>
      </div>
    </section>
  );
}
