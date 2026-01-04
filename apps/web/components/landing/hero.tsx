import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import loupeImage from "@/assets/loupe.webp";

export function Hero() {
  return (
    <section className="relative flex h-screen flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      {/* Background Image */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden flex justify-center">
        <Image
          src={loupeImage}
          alt=""
          priority
          className="h-screen w-full max-w-none opacity-40 object-cover blur-sm"
        />
        {/* Grain overlay */}
        <div
          className="absolute inset-0 opacity-[0.25] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
        {/* Badge */}
        <Badge
          variant="ghost"
          className={cn(
            "animate-fade-in-up px-4 text-sm select-none",
            "hover:bg-transparent",
            "hover:bg-linear-to-r hover:from-foreground hover:to-primary hover:bg-clip-text hover:text-transparent",
            "bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent",
          )}
        >
          AI Powered Git Commits
        </Badge>

        <div className={cn("space-y-3")}>
          {/* Headline */}
          <h1
            className={cn(
              "animate-fade-in-up animation-delay-100",
              "text-4xl! font-semibold tracking-tight",
              "sm:text-5xl md:text-6xl lg:text-7xl tracking-tighter",
              // "bg-linear-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent",
            )}
          >
            Focus on Code, Not Commits
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-in-up animation-delay-200 max-w-2xl text-sm text-muted-foreground tracking-tighter">
            Generate conventional commit messages instantly with AI
          </p>
        </div>

        {/* CTA Buttons */}
        <Link
          href="#installation"
          className={cn(
            buttonVariants({
            variant: "outline",
              size: "lg",
            }),
            "bg-primary/4! border border-primary/20! text-primary!",
            "hover:bg-primary/12! hover:border-primary/40!",
            "pl-4 rounded-xs text-sm!",
            "animate-fade-in-up animation-delay-300 my-5",
          )}
        >
          $ Get Started
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>

        {/* Terminal Demo */}
        {/* <div className="animate-fade-in-up animation-delay-400 mt-8 w-full"> */}
        {/*   <TerminalDemo /> */}
        {/* </div> */}
      </div>
    </section>
  );
}
