import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadFormData } from "@/components/quiz/lead-form";

export type QuizAnswers = Record<string, string>;

interface StoredQuiz {
  idx: number;
  answers: QuizAnswers;
  lead: LeadFormData | null;
}

const INITIAL: StoredQuiz = { idx: 0, answers: {}, lead: null };

const STORAGE_KEY = "g1st_quiz";

function isLead(value: unknown): value is LeadFormData {
  if (!value || typeof value !== "object") return false;
  const lead = value as Record<string, unknown>;
  return (
    typeof lead.name === "string" &&
    typeof lead.phone === "string" &&
    typeof lead.email === "string" &&
    typeof lead.postcode === "string" &&
    (lead.contactMethod === "phone" || lead.contactMethod === "email")
  );
}

function sanitize(value: unknown, totalSteps: number): Partial<StoredQuiz> | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Record<string, unknown>;
  const clean: Partial<StoredQuiz> = {};
  if (
    typeof saved.idx === "number" &&
    Number.isInteger(saved.idx) &&
    saved.idx >= 0 &&
    saved.idx < totalSteps
  ) {
    clean.idx = saved.idx;
  }
  if (saved.answers && typeof saved.answers === "object" && !Array.isArray(saved.answers)) {
    const answers: QuizAnswers = {};
    for (const [key, answer] of Object.entries(saved.answers as Record<string, unknown>)) {
      if (typeof answer === "string" && answer.length <= 500) answers[key] = answer;
    }
    clean.answers = answers;
  }
  if (isLead(saved.lead)) clean.lead = saved.lead;
  return Object.keys(clean).length > 0 ? clean : null;
}

export function useQuizState(totalSteps: number): QuizState {
  const [quiz, setQuiz] = useState<StoredQuiz>(INITIAL);
  // Flips on the first user interaction. Until then the persistence effect must
  // never write, or a fresh mount would clobber saved progress before hydration.
  const touchedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const clean = sanitize(saved, totalSteps);
      if (clean) {
        // One-time hydration from localStorage after mount; must not run during SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuiz((prev) => ({ ...prev, ...clean }));
      }
    } catch { /* ignore corrupted storage */ }
  }, [totalSteps]);

  useEffect(() => {
    if (!touchedRef.current && quiz === INITIAL) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(quiz)); } catch { /* ignore */ }
  }, [quiz]);

  const setIdx = useCallback((newIdx: number) => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, idx: Math.max(0, Math.min(newIdx, totalSteps - 1)) }));
  }, [totalSteps]);

  const selectOption = useCallback((key: string, value: string) => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, answers: { ...prev.answers, [key]: value } }));
    setTimeout(() => setQuiz((prev) => ({ ...prev, idx: Math.min(prev.idx + 1, totalSteps - 1) })), 240);
  }, [totalSteps]);

  const goNext = useCallback(
    () => {
      touchedRef.current = true;
      setQuiz((prev) => ({ ...prev, idx: Math.min(prev.idx + 1, totalSteps - 1) }));
    },
    [totalSteps],
  );
  const goPrev = useCallback(() => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, idx: Math.max(prev.idx - 1, 0) }));
  }, []);
  const completeLead = useCallback((submittedLead: LeadFormData) => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, lead: submittedLead, idx: totalSteps - 1 }));
  }, [totalSteps]);

  return {
    idx: quiz.idx,
    answers: quiz.answers,
    lead: quiz.lead,
    submitted: quiz.lead !== null,
    setIdx,
    selectOption,
    goNext,
    goPrev,
    completeLead,
  };
}

export interface QuizState {
  idx: number;
  answers: QuizAnswers;
  lead: LeadFormData | null;
  submitted: boolean;
  setIdx: (idx: number) => void;
  selectOption: (key: string, value: string) => void;
  goNext: () => void;
  goPrev: () => void;
  completeLead: (lead: LeadFormData) => void;
}
