"use client";
// Home: scroll-driven story over the Spline globe (page-flow.md section 2).
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import ErrorBoundary from "@/components/ErrorBoundary";

const SplineScene = dynamic(() => import("@/components/SplineScene"), { ssr: false });

const STEPS = [
  {
    state: "Welcome",
    kicker: "The problem",
    title: "Every dry season, smoke covers Southeast Asia.",
    body: "Satellites have watched these fires for 25 years. But the satellites changed, so the record can't be compared from one year to the next.",
  },
  {
    state: "Welcome",
    kicker: "Two generations",
    title: "Five satellites, two kinds of eyes.",
    body: "MODIS on Terra and Aqua (2000–) sees 1 km pixels. VIIRS on S-NPP, NOAA-20 and NOAA-21 (2012–) sees 375 m pixels and finds far more small fires. Switch from one to the other and fire counts jump 4×, even though the fires didn't change. Click a satellite to learn more.",
  },
  {
    state: "Story_Scan",
    kicker: "Nobody sees everything",
    title: "Each satellite misses fires the others see.",
    body: "Over Borneo, big fires are seen by every pass. Small peat fires are seen by one, or by none. In the afternoon window FireCensus uses three of them: Aqua, S-NPP and NOAA-20.",
  },
  {
    state: "Story_Zoom",
    kicker: "The idea",
    title: "Ecologists count animals they can't fully see. We count fires the same way.",
    body: "Each fire gets a capture history: (1,0,1) means Aqua and NOAA-20 saw it but S-NPP didn't. From thousands of these histories, capture-recapture statistics estimate how many fires no satellite saw, the (0,0,0) fires.",
  },
  {
    state: "Story_Handoff",
    kicker: "The result",
    title: "One fire record, 2002–2026, where the sensor doesn't matter.",
    body: "Remove a satellite and the raw counts move by 15–25%. The FireCensus estimate moves by 0–6%. When S-NPP went silent on 2 November 2026, nothing broke.",
    cta: true,
  },
];

export default function Home() {
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [failed, setFailed] = useState(false);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    api.health().catch(() => {}); // wake the backend early
    const onRej = (e: PromiseRejectionEvent) => {
      if (String(e.reason).includes("fetch") || String(e.reason).toLowerCase().includes("spline")) { e.preventDefault(); setFailed(true); setLoaded(true); }
    };
    window.addEventListener("unhandledrejection", onRej);
    const giveUp = setTimeout(() => setLoaded(true), 20000); // never trap the visitor behind the loader
    setMobile(window.innerWidth < 768);
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => { io.disconnect(); window.removeEventListener("unhandledrejection", onRej); clearTimeout(giveUp); };
  }, []);

  return (
    <main className="relative">
      {/* sticky globe */}
      <div className="fixed inset-0 z-0">
        {mobile || failed ? (
          <div className="h-full w-full bg-[radial-gradient(circle_at_60%_45%,#16305a_0%,#0B0F1A_60%)]" />
        ) : (
          <ErrorBoundary fallback={null} onError={() => { setFailed(true); setLoaded(true); }}>
            <SplineScene state={STEPS[step].state} onLoaded={() => setLoaded(true)} />
          </ErrorBoundary>
        )}
      </div>
      {!loaded && !mobile && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-space">
          <div className="text-center">
            <div className="mx-auto mb-4 h-3 w-3 animate-ping rounded-full bg-fire" />
            <p className="text-slate-400">Waking up 5 satellites…</p>
          </div>
        </div>
      )}

      <Link href="/explore" className="btn fixed bottom-5 right-5 z-30 bg-space/80">Skip story →</Link>

      {/* progress dots */}
      <div className="fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i === step ? "bg-fire" : "bg-white/25"}`} />
        ))}
      </div>

      {/* scrolling text cards */}
      <div className="pointer-events-none relative z-20">
        {STEPS.map((s, i) => (
          <div key={i} ref={(el) => { refs.current[i] = el; }} data-i={i} className="flex min-h-screen items-center px-6 md:px-16">
            <div className={`card pointer-events-auto max-w-md p-6 transition-opacity duration-500 ${i === step ? "opacity-100" : "opacity-40"}`}>
              <div className="label text-fire">{s.kicker}</div>
              <h2 className="mt-2 text-2xl font-semibold leading-snug">{s.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-300">{s.body}</p>
              {s.cta && (
                <Link href="/explore?case=indonesia-2026" className="mt-5 inline-block rounded-lg bg-fire px-4 py-2 font-semibold text-black hover:brightness-110">
                  Explore the burning calendar →
                </Link>
              )}
            </div>
          </div>
        ))}
        <div className="h-[30vh]" />
      </div>
    </main>
  );
}
