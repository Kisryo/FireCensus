"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Story" },
  { href: "/explore", label: "Explore" },
  { href: "/cases", label: "Cases" },
  { href: "/method", label: "Method" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-space/70 backdrop-blur">
      <nav className="mx-auto flex h-12 max-w-[1600px] items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-fire shadow-[0_0_10px_#FF6B35]" />
          FireCensus
        </Link>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1 ${path === l.href ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto hidden text-xs text-slate-500 md:block">
          NASA Space Apps 2026 · Harmonization of MODIS and VIIRS Hot Spots
        </span>
      </nav>
    </header>
  );
}
