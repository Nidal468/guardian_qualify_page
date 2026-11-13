import { ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import ProgressBar from "./progress-bar";

interface QuizCardProps {
  pct: number;
  isDone: boolean;
  currentStep?: number;
  totalSteps?: number;
  children: ReactNode;
}

export default function QuizCard({ pct, isDone, currentStep, totalSteps, children }: QuizCardProps) {
  return (
    <div className={`relative w-full max-w-3xl mx-auto bg-white/90 backdrop-blur-sm rounded-3xl border border-brand-100/80 shadow-[0_2px_8px_rgba(0,0,0,0.03),0_12px_40px_rgba(20,53,31,0.10)] overflow-hidden ${isDone ? "p-3 sm:p-4" : "p-3 sm:p-4 md:p-6"}`}>
      {/* Subtle top gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 opacity-80"
        aria-hidden="true"
      />

      {!isDone && (
        <>
          <ProgressBar pct={pct} currentStep={currentStep} totalSteps={totalSteps} />
          <div className="h-px bg-gradient-to-r from-transparent via-brand-100 to-transparent my-3 -mx-3 sm:-mx-4 md:-mx-6" aria-hidden="true" />
        </>
      )}

      {children}

      {!isDone && false && (
        <div className="mt-4 pt-3 border-t border-gray-100/80">
          <div className="flex items-center justify-center gap-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-gray-400 text-xs font-medium px-3 py-1 rounded-full bg-gray-50/80">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-500" aria-hidden="true" />
              Safe & Secure
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-400 text-xs font-medium px-3 py-1 rounded-full bg-gray-50/80">
              <Lock className="w-3 h-3 text-brand-500" strokeWidth={2} aria-hidden="true" />
              Encrypted
            </span>
            <a
              href="https://guardian1st.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gray-400 text-xs font-medium px-3 py-1 rounded-full bg-gray-50/80 hover:text-brand-600 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      )}
    </div>
  );
}