"use client";

import { useCallback, useEffect } from "react";

interface QuizKeyboardOptions {
  /** Number of options in current question */
  optionCount: number;
  /** Callback when an option is selected by index */
  onSelectByIndex: (index: number) => void;
  /** Callback when Enter is pressed (advance/confirm) */
  onEnter?: () => void;
  /** Callback when Escape/Backspace is pressed (go back) */
  onBack?: () => void;
  /** Whether keyboard nav is enabled */
  enabled?: boolean;
  /** Whether an input is currently focused (disables shortcuts) */
  isInputFocused?: boolean;
}

/**
 * Hook for quiz keyboard navigation.
 * - Number keys 1-9: Select option by index
 * - Enter: Confirm/advance
 * - Escape or Backspace: Go back (when not in input)
 * - Arrow keys handled in component for roving tabindex
 */
export function useQuizKeyboard({
  optionCount,
  onSelectByIndex,
  onEnter,
  onBack,
  enabled = true,
}: QuizKeyboardOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Number keys 1-9 select options
      if (!isInput && /^[1-9]$/.test(event.key)) {
        const index = parseInt(event.key, 10) - 1;
        if (index < optionCount) {
          event.preventDefault();
          onSelectByIndex(index);
        }
        return;
      }

      // Enter to advance (when not in input or button)
      if (event.key === "Enter" && !isInput && target.tagName !== "BUTTON") {
        event.preventDefault();
        onEnter?.();
        return;
      }

      // Escape or Backspace to go back (when not in input)
      if (!isInput && (event.key === "Escape" || event.key === "Backspace")) {
        event.preventDefault();
        onBack?.();
      }
    },
    [enabled, optionCount, onSelectByIndex, onEnter, onBack],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

interface FormKeyboardOptions {
  /** Callback to focus next field */
  onNextField?: () => void;
  /** Callback to focus previous field */
  onPrevField?: () => void;
  /** Whether Enter should submit (on last field) */
  isLastField?: boolean;
}

/**
 * Hook for form keyboard navigation.
 * Handles Enter to move to next field within inputs.
 */
export function useFormKeyboard({ onNextField, onPrevField, isLastField = false }: FormKeyboardOptions) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !isLastField) {
        event.preventDefault();
        onNextField?.();
      }
      if (event.key === "ArrowUp" && event.altKey) {
        event.preventDefault();
        onPrevField?.();
      }
    },
    [isLastField, onNextField, onPrevField],
  );

  return { handleKeyDown };
}

/**
 * Check if device likely has physical keyboard (for showing hints)
 */
export function useHasPhysicalKeyboard(): boolean {
  if (typeof window === "undefined") return false;
  // Hide keyboard hints on touch-only devices
  return !("ontouchstart" in window) || navigator.maxTouchPoints === 0;
}