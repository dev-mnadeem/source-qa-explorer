import { PasteUrlForm } from "@/components/PasteUrlForm";

const PIPELINE = [
  {
    step: "01",
    title: "Investigate",
    body: "An agent explores the checkout with real tools — list, search, read — until it has evidence.",
  },
  {
    step: "02",
    title: "Verify",
    body: "Every cited line range is resolved against the source. A citation that does not exist fails here.",
  },
  {
    step: "03",
    title: "Audit",
    body: "A second, independent pass reviews whether the answer is actually supported by what was cited.",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col items-center px-6 pt-24 pb-20">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative w-full max-w-2xl">
        <div className="fade-up space-y-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] tracking-widest text-muted uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Grounded code Q&amp;A
          </span>

          <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            Codebase
            <br />
            <span className="text-accent">Investigator</span>
          </h1>

          <p className="mx-auto max-w-lg text-pretty text-[17px] leading-relaxed text-foreground-2">
            Paste a public GitHub repository and ask questions in plain English.
            Every answer is grounded in real files and line ranges — and then{" "}
            <span className="font-medium text-foreground">
              independently audited
            </span>{" "}
            by a second agent that can disagree.
          </p>
        </div>

        <div className="fade-up mt-10">
          <PasteUrlForm />
        </div>

        <div className="fade-up mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {PIPELINE.map((item) => (
            <div key={item.step} className="bg-surface p-5">
              <div className="font-mono text-[11px] tracking-widest text-accent">
                {item.step}
              </div>
              <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <div className="fade-up mt-10 space-y-2 text-center">
          <div className="font-mono text-[11px] tracking-widest text-muted uppercase">
            Try asking
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "How does auth work here?",
              "Walk me through the signup flow",
              "Is there dead code?",
            ].map((q) => (
              <span
                key={q}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground-2"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
