import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function QuizHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-brand-100/60 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="max-w-285 mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="Guardian 1st home"
          className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <img src="/logo.png" alt="Guardian 1st" className="h-8 sm:h-11 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-2 text-brand-700">
          <span className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-brand-600" strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="font-semibold text-sm leading-snug">
            Free, no-obligation<br />home assessments
          </p>
        </div>
      </div>
    </header>
  );
}