"use client";

import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface OptionButtonProps {
  value: string;
  icon: React.ReactNode;
  isSelected: boolean;
  tabIndex: number;
  index?: number;
  showKeyboardHint?: boolean;
  onClick: (value: string) => void;
}

const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(function OptionButton(
  { value, icon, isSelected, tabIndex, index, showKeyboardHint = false, onClick },
  ref,
) {
  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (index ?? 0) * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={isSelected}
        data-option
        tabIndex={tabIndex}
        onClick={() => onClick(value)}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative w-full min-h-[72px] sm:min-h-[80px] border-2 rounded-2xl bg-white transition-all duration-200 flex items-center gap-3.5 sm:gap-4 p-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 focus-visible:border-brand-500 ${
          isSelected
            ? "border-brand-500 bg-gradient-to-br from-brand-50 to-brand-100/50 shadow-[0_4px_16px_rgba(46,122,69,0.15)]"
            : "border-gray-200/80 hover:border-brand-300 hover:bg-brand-50/30 hover:shadow-[0_2px_12px_rgba(46,122,69,0.08)]"
        }`}
      >
        {/* Icon container with spring animation */}
        <motion.span
          aria-hidden="true"
          animate={isSelected ? { scale: [1, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
            isSelected
              ? "bg-brand-600 text-white shadow-[0_4px_12px_rgba(46,122,69,0.3)]"
              : "bg-brand-50 text-brand-600"
          }`}
        >
          {icon}
        </motion.span>

        {/* Label */}
        <span
          className={`flex-1 font-semibold text-base sm:text-[17px] leading-snug transition-colors duration-200 ${
            isSelected ? "text-brand-900" : "text-gray-800"
          }`}
        >
          {value}
        </span>

        {/* Keyboard number hint */}
        {showKeyboardHint && index !== undefined && index < 9 && (
          <span className="hidden sm:flex absolute top-2 right-2 kbd-hint" aria-hidden="true">
            {index + 1}
          </span>
        )}

        {/* Animated checkmark */}
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={
            isSelected
              ? { scale: [0, 1.2, 1], opacity: 1, rotate: [0, -10, 0] }
              : { scale: 0, opacity: 0 }
          }
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-brand-600 text-white shadow-[0_2px_8px_rgba(46,122,69,0.3)]"
        >
          <Check className="w-4 h-4" strokeWidth={3} />
        </motion.span>

        {/* Selection glow effect */}
        {isSelected && (
          <motion.span
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: "inset 0 0 0 1px rgba(46,122,69,0.1)",
            }}
          />
        )}
      </motion.button>
    </motion.div>
  );
});

export default OptionButton;