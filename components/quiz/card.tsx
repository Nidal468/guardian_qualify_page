import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Coffee, Lock, ShieldCheck } from "lucide-react";
import ProgressBar from "./progress-bar";

interface QuizCardProps {
  pct: number;
  isDone: boolean;
  currentStep?: number;
  totalSteps?: number;
  children: ReactNode;
}

const REASSURE_COPY: Record<number, string> = {
  1: "It only takes about a minute!",
  2: "50 seconds left…",
  3: "40 seconds left…",
  4: "30 seconds left…",
  5: "20 seconds left…",
  6: "10 seconds left…",
};

export default function QuizCard({ pct, isDone, currentStep, totalSteps, children }: QuizCardProps) {
  const progressNumeric = currentStep || 0;

  return (
    <div className="relative w-full max-w-4xl mx-auto bg-white rounded-xl border border-gray-200 shadow-[0_4px_32px_rgba(38,71,43,.14),0_2px_6px_rgba(0,0,0,.04)] p-3 sm:p-6 md:p-11">
      {/* Progress */}
      {!isDone && <ProgressBar pct={pct} />}

      {/* Divider */}
      {!isDone && <div className="h-px bg-[#eef1ee] my-3 -mx-3 sm:-mx-6 md:-mx-11" />}

      {/* Form */}
      <div className="lead-steps-form">{children}</div>

      {/* Timer text */}
      {!isDone && (
        <div className="my-3 sm:my-4">
          <div className="flex items-center justify-center gap-1.5">
            <span className="inline-flex"><Coffee className="w-3.5 h-4 sm:w-[14px] sm:h-[17px]" fill="#26472b" /></span>
            <p className="text-[#272728] text-xs sm:text-sm font-bold m-0">
              <b>{REASSURE_COPY[progressNumeric] || "It only takes about a minute!"}</b>
            </p>
          </div>
        </div>
      )}

      {/* Secure links */}
      {!isDone && (
        <div className="mt-2 sm:mt-2.5 pt-2 sm:pt-2.5 border-t border-[#f0f0f0] text-center">
          <span className="inline-flex items-center gap-1 sm:gap-1.5 text-gray-500 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-0 border-r border-gray-200 whitespace-nowrap">
            <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Safe
          </span>
          <span className="inline-flex items-center gap-1 sm:gap-1.5 text-gray-500 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-0 border-r border-gray-200 whitespace-nowrap">
            <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" strokeWidth={2} /> Secure
          </span>
          <a
            href="https://guardian1st.io/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 sm:gap-1.5 text-gray-500 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-0 border-r-0 whitespace-nowrap"
          >
            Privacy Policy
          </a>
        </div>
      )}
    </div>
  );
}