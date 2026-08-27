import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import CallToAction from "@/components/landing/CallToAction";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <CallToAction />
      <footer className="border-t border-line px-5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-fg-subtle">
          <span>Findr — campus lost &amp; found, SRM Kattankulathur</span>
          <span>Report it once. Findr keeps looking.</span>
        </div>
      </footer>
    </>
  );
}
