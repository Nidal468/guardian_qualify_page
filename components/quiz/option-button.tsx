"use client";

import { forwardRef, useRef, useState } from "react";
import { motion } from "framer-motion";

interface OptionButtonProps {
  value: string;
  icon: React.ReactNode;
  isSelected: boolean;
  tabIndex: number;
  index?: number;
  showKeyboardHint?: boolean;
  isStacked?: boolean;
  disabled?: boolean;
  onClick: (value: string) => void;
}

const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(function OptionButton(
  { value, icon, isSelected, tabIndex, isStacked = false, disabled = false, onClick },
  ref,
) {
  const lockRef = useRef(false);

  const handleClick = () => {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    onClick(value);
    setTimeout(() => { lockRef.current = false; }, 400);
  };

  return (
    <motion.div
      className={`w-full ${isStacked ? "max-w-none flex-1" : ""}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={isSelected}
        data-option
        tabIndex={tabIndex}
        onClick={handleClick}
        disabled={disabled}
        className={`w-full border-2 rounded-xl bg-white transition-all overflow-hidden ${isSelected ? "border-green-500 bg-green-50 shadow-[0_0_0_3px_rgba(55,202,55,.2)]" : "border-gray-200 hover:border-green-500 hover:bg-green-50/50"} ${isStacked ? "flex flex-row p-3 justify-start gap-3.5" : "h-20 sm:h-24 md:h-28"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <label className={`flex cursor-pointer ${isStacked ? "flex-row items-center p-3" : "flex-col items-center"}`}>
          <span className={`rounded-full bg-green-100 text-[#26472b] flex items-center justify-center mb-2 transition-all ${isStacked ? "w-8 h-8 sm:w-10 sm:h-10 mb-0 flex-shrink-0" : "w-8 h-8 sm:w-10 sm:h-10"}`}>
            {icon}
          </span>
          <span className={`font-bold text-[#141414] ${isStacked ? "text-sm sm:text-base" : "text-xs sm:text-sm"} ${isStacked ? "" : "mt-0"}`}>{value}</span>
        </label>
      </button>
    </motion.div>
  );
});

export default OptionButton;