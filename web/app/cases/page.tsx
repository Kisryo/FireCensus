import Link from "next/link";
import { CASES } from "@/lib/regions";

export default function CasesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-24">
      <h1 className="text-3xl font-semibold">Cases</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Five fire seasons chosen because they are hard: smouldering peat, thousands of small farm fires,
        a decade with only one sensor, and a satellite that switched off in the middle of a crisis.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {CASES.map((c) => (
          <article key={c.id} className="card flex flex-col p-6">
            <div className="label text-fire">{c.kicker}</div>
            <h2 className="mt-1 text-xl font-semibold">{c.title}</h2>
            <ul className="mt-3 flex-1 space-y-2 text-[15px] leading-relaxed text-slate-300">
              {c.story.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
            <Link href={`/explore?case=${c.id}`} className="btn btn-on mt-5 self-start">Open in Explore →</Link>
          </article>
        ))}
      </div>
    </main>
  );
}
