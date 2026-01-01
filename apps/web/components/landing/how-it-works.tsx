import { CodeBlock } from "./code-block";

const steps = [
  {
    number: "1",
    title: "Run AI Git",
    description:
      "Just run ai-git in your repository. No manual staging required.",
    code: "ai-git",
  },
  {
    number: "2",
    title: "Select Files to Stage",
    description:
      "Interactively choose files to stage: select all, pick specific files, or skip if already staged.",
    code: `? Select files to stage
  ◉ src/auth/oauth.ts
  ◉ src/auth/session.ts
  ◯ src/utils/helpers.ts

> Stage selected  Stage all  Skip`,
  },
  {
    number: "3",
    title: "Review & Commit",
    description:
      "Review the AI-generated message, edit if needed, and commit with confidence.",
    code: `feat(auth): add OAuth2 login flow

- implement Google OAuth provider
- add session token management
- create login/logout endpoints`,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-y border-border bg-muted/30 px-4 py-24 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-4xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three simple steps to perfect commit messages
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 hidden h-full w-px bg-border md:block" />

          <div className="space-y-12">
            {steps.map((step, index) => (
              <div key={step.number} className="relative flex gap-6">
                {/* Step number */}
                <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-lg font-bold text-primary">
                  {step.number}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                  <p className="mb-4 text-muted-foreground">
                    {step.description}
                  </p>
                  <CodeBlock
                    code={step.code}
                    language={
                      index === 0 ? "bash" : index === 1 ? "terminal" : "commit"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
