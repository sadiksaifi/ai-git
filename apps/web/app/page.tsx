import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Providers } from "@/components/landing/providers";
import { Installation } from "@/components/landing/installation";
import { Footer } from "@/components/landing/footer";

export default function Page() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Providers />
        <Installation />
      </main>
      <Footer />
    </>
  );
}
