"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  const [backLocked, setBackLocked] = useState(false);

  const handleBackClick = useCallback(() => {
    if (backLocked) return;
    setBackLocked(true);
    onGoPrev();
    setTimeout(() => setBackLocked(false), 300);
  }, [backLocked, onGoPrev]);

  const selectByIndex = useCallback(
    (index: number) => {
      const opt = options[index];
      if (opt) onSelectOption(currentStep.key, opt.value);
    },
    [options, currentStep.key, onSelectOption],
  );

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
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        className="px-1 sm:px-4 md:px-12"
      >
        <div className="relative flex items-center justify-center gap-2 sm:gap-4">
          {idx > 0 && (
            <motion.button
              type="button"
              disabled={backLocked}
              onClick={handleBackClick}
              whileHover={backLocked ? {} : { scale: 1.05 }}
              whileTap={backLocked ? {} : { scale: 0.95 }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-gray-200 bg-white text-[#26472b] flex items-center justify-center transition-all hover:border-green-500 hover:bg-green-50"
              aria-label="Previous question"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          )}
          <h3 className="text-[#141414] font-bold text-[18px] sm:text-[22px] md:text-[26px] leading-6 sm:leading-7 md:leading-8.5 tracking-tight text-center">{currentStep.title}</h3>
        </div>

        {/* Options */}
        <div className="my-2">
          <motion.div
            ref={groupRef}
            role="radiogroup"
            aria-label={currentStep.title}
            onKeyDown={handleKeyDown}
            className={`flex flex-col sm:flex-row gap-2 p-3 sm:p-6 md:p-10 ${currentStep.isStacked ? "flex-col items-stretch" : ""}`}
            layout
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
                isStacked={currentStep.isStacked}
                onClick={(value) => onSelectOption(currentStep.key, value)}
              />
            ))}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}