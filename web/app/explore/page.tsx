"use client";
// /explore is now chapter 9 of the single story page ("/#explore"). Kept as a route so old links,
// the Cases page (?case=) and the flat 2D fallback (?flat=1) keep working.
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuidedExplore, { useAreaFromUrl } from "@/components/GuidedExplore";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const init = useAreaFromUrl();
  const flat = params.get("flat") === "1";
  const [area, setArea] = useState(init.key);
  useEffect(() => {
    if (flat) return;
    const q = new URLSearchParams();
    ["case", "country"].forEach((k) => params.get(k) && q.set(k, params.get(k)!));
    router.replace(`/${q.toString() ? "?" + q.toString() : ""}#explore`);
  }, [flat, params, router]);
  if (!flat) return <div className="pt-24 text-center text-slate-400">Opening the globe…</div>;
  return <GuidedExplore area={area} onArea={setArea} initYear={init.y} initMonth={init.m} />;
}

export default function ExplorePage() {
  return <Suspense fallback={<div className="pt-24 text-center text-slate-400">Loading…</div>}><Inner /></Suspense>;
}
