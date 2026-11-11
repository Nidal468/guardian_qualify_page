"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  pct: number;
  currentStep?: number;
  totalSteps?: number;
}

export default function ProgressBar({ pct, currentStep, totalSteps }: ProgressBarProps) {
  const showSteps = currentStep !== undefined && totalSteps !== undefined;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-brand-800">
          {showSteps ? (
            <>
              Question {currentStep} <span className="text-brand-400 font-medium">of {totalSteps}</span>
            </>
          ) : (
            "Progress"
          )}
        </span>
        <motion.span
          key={pct}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-bold text-brand-600 tabular-nums"
        >
          {pct}%
        </motion.span>
      </div>

      <div
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="relative h-2.5 bg-brand-100/80 rounded-full overflow-hidden"
      >
        {/* Animated fill with gradient */}
        <motion.div
          className="relative h-full rounded-full bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Subtle glow at the tip */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/40 blur-[2px]"
            style={{ animation: "progress-glow 1.5s ease-in-out infinite" }}
          />
        </motion.div>

        {/* Shimmer overlay for polish */}
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 2.5s ease-in-out infinite",
          }}
        />
      </div>

      {/* Step dots for visual progress */}
      {showSteps && totalSteps <= 10 && (
        <div className="flex justify-between mt-2 px-0.5">
          {Array.from({ length: totalSteps }, (_, i) => {
            const isCompleted = i < currentStep - 1;
            const isCurrent = i === currentStep - 1;
            return (
              <motion.div
                key={i}
                className={`rounded-full transition-colors duration-300 ${
                  isCompleted
                    ? "w-1.5 h-1.5 bg-brand-500"
                    : isCurrent
                      ? "w-2 h-2 bg-brand-600 ring-2 ring-brand-200"
                      : "w-1.5 h-1.5 bg-brand-200"
                }`}
                animate={isCurrent ? { scale: [1, 1.2, 1] } : {}}
                transition={isCurrent ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}