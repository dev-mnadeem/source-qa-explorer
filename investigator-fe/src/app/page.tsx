import { PasteUrlForm } from "@/components/PasteUrlForm";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">
            Codebase Investigator
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Paste a public GitHub repo and ask questions in plain English.
            Every answer is grounded in real files and line ranges, and{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              independently audited
            </span>
            .
          </p>
        </div>
        <PasteUrlForm />
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center space-y-1">
          <div>Try questions like:</div>
          <div className="italic">
            &ldquo;How does auth work here?&rdquo; · &ldquo;Walk me through the
            signup flow&rdquo; · &ldquo;Is there dead code?&rdquo;
          </div>
        </div>
      </div>
    </main>
  );
}
