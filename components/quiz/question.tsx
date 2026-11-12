"use client";

import { useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { StepData } from "@/lib/quiz-data";
import { useQuizKeyboard, useHasPhysicalKeyboard } from "@/lib/use-keyboard-nav";
import OptionButton from "./option-button";

interface QuizQuestionProps {
  currentStep: StepData;
  idx: number;
  answers: Record<string, string>;
  onSelectOption: (key: string, value: string) => void;
  onGoPrev: () => void;
}

export default function QuizQuestion({ currentStep, idx, answers, onSelectOption, onGoPrev }: QuizQuestionProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selected = answers[currentStep.key];
  const options = useMemo(() => currentStep.options || [], [currentStep.options]);
  const hasKeyboard = useHasPhysicalKeyboard();

  const selectByIndex = useCallback(
    (index: number) => {
      const opt = options[index];
      if (opt) onSelectOption(currentStep.key, opt.value);
    },
    [options, currentStep.key, onSelectOption],
  );

  // Global keyboard shortcuts: numbers to select, Escape/Backspace to go back
  useQuizKeyboard({
    optionCount: options.length,
    onSelectByIndex: selectByIndex,
    onBack: idx > 0 ? onGoPrev : undefined,
  });

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    buttons[next]?.focus();
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep.key}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative flex items-center justify-center gap-3 sm:gap-4">
          {idx > 0 && (
            <motion.button
              type="button"
              onClick={onGoPrev}
              aria-label="Previous question"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-gray-200 bg-white text-brand-700 flex items-center justify-center transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="text-gray-900 font-bold text-xl sm:text-2xl md:text-[27px] leading-snug tracking-tight text-center"
          >
            {currentStep.title}
          </motion.h3>
        </div>

        {currentStep.subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-1.5 text-brand-600 font-semibold text-sm sm:text-base text-center"
          >
            {currentStep.subtitle}
          </motion.p>
        )}

        <div
          ref={groupRef}
          role="radiogroup"
          aria-label={currentStep.title}
          onKeyDown={handleKeyDown}
          className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {options.map((opt, index) => (
            <OptionButton
              key={opt.value}
              value={opt.value}
              icon={opt.icon}
              isSelected={selected === opt.value}
              tabIndex={selected === opt.value || (!selected && index === 0) ? 0 : -1}
              index={index}
              showKeyboardHint={hasKeyboard}
              onClick={(value) => onSelectOption(currentStep.key, value)}
            />
          ))}
        </div>

        {/* Status and keyboard hints */}
        <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
          <p
            className={`text-sm font-medium transition-colors duration-200 ${
              selected ? "text-brand-700" : "text-gray-400"
            }`}
            aria-live="polite"
          >
            {selected ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                Selected: {selected}
              </span>
            ) : (
              "Tap an option to continue"
            )}
          </p>

          {hasKeyboard && (
            <p className="hidden sm:flex items-center gap-2 text-xs text-gray-400" aria-hidden="true">
              <span className="kbd-hint">1–{options.length}</span>
              <span>select</span>
              {idx > 0 && (
                <>
                  <span className="kbd-hint">Esc</span>
                  <span>back</span>
                </>
              )}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}