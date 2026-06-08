import { PasteUrlForm } from "@/components/PasteUrlForm";
import { EXAMPLE_QUESTIONS } from "@/shared/questions";

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
    <main className="relative flex flex-1 flex-col items-center px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative w-full max-w-2xl">
        <div className="fade-up space-y-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] tracking-widest text-muted uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Grounded code Q&amp;A
          </span>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Codebase
            <br />
            <span className="text-accent">Investigator</span>
          </h1>

          <p className="mx-auto max-w-lg text-pretty text-base leading-relaxed text-foreground-2 sm:text-[17px]">
            Paste a public GitHub repository and ask questions in plain English.
            Every answer cites real files and line ranges, which are checked
            against the checkout and then{" "}
            <span className="font-medium text-foreground">
              audited by a second pass
            </span>{" "}
            that can disagree.
          </p>
        </div>

        <div className="fade-up mt-10">
          <PasteUrlForm />
        </div>

        <ol className="fade-up mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {PIPELINE.map((item) => (
            <li key={item.step} className="bg-surface p-5">
              <div className="font-mono text-[11px] tracking-widest text-accent">
                {item.step}
              </div>
              <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {item.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="fade-up mt-10 space-y-2 text-center">
          <h2 className="font-mono text-[11px] tracking-widest text-muted uppercase">
            Questions it handles
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <li
                key={q}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground-2"
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
