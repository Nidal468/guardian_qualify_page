import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadFormData } from "@/components/quiz/lead-form";

export type QuizAnswers = Record<string, string>;

export type FormFields = Partial<Omit<LeadFormData, "contactMethod">> & {
  contactMethod?: "phone" | "email" | "";
};

interface StoredQuiz {
  idx: number;
  answers: QuizAnswers;
  lead: LeadFormData | null;
  showCallScreen: boolean;
  formFields: FormFields;
  dev?: boolean;
}

const INITIAL: StoredQuiz = { idx: 0, answers: {}, lead: null, showCallScreen: false, formFields: {}, dev: false };

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

function sanitizeFormFields(value: unknown): FormFields {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const fields: FormFields = {};
  if (typeof raw.name === "string" && raw.name.length <= 100) fields.name = raw.name;
  if (typeof raw.phone === "string" && raw.phone.length <= 20) fields.phone = raw.phone;
  if (typeof raw.email === "string" && raw.email.length <= 254) fields.email = raw.email;
  if (typeof raw.postcode === "string" && raw.postcode.length <= 8) fields.postcode = raw.postcode;
  if (raw.contactMethod === "phone" || raw.contactMethod === "email") fields.contactMethod = raw.contactMethod;
  return fields;
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
  if (saved.formFields && typeof saved.formFields === "object") {
    clean.formFields = sanitizeFormFields(saved.formFields);
  }
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
      // Only hydrate from storage if dev mode is enabled
      if (saved?.dev !== true) return;
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
    // Only persist to storage if dev mode is enabled
    if (quiz.dev !== true) return;
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
    setQuiz((prev) => ({ ...prev, lead: submittedLead, idx: totalSteps - 1, showCallScreen: false, formFields: {} }));
  }, [totalSteps]);

  const goToCallScreen = useCallback(() => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, showCallScreen: true }));
  }, []);

  const updateFormFields = useCallback((fields: Partial<FormFields>) => {
    touchedRef.current = true;
    setQuiz((prev) => ({ ...prev, formFields: { ...prev.formFields, ...fields } }));
  }, []);

  return {
    idx: quiz.idx,
    answers: quiz.answers,
    lead: quiz.lead,
    submitted: quiz.lead !== null,
    showCallScreen: quiz.showCallScreen,
    formFields: quiz.formFields,
    setIdx,
    selectOption,
    goNext,
    goPrev,
    completeLead,
    goToCallScreen,
    updateFormFields,
  };
}

export interface QuizState {
  idx: number;
  answers: QuizAnswers;
  lead: LeadFormData | null;
  submitted: boolean;
  showCallScreen: boolean;
  formFields: FormFields;
  setIdx: (idx: number) => void;
  selectOption: (key: string, value: string) => void;
  goNext: () => void;
  goPrev: () => void;
  completeLead: (lead: LeadFormData) => void;
  goToCallScreen: () => void;
  updateFormFields: (fields: Partial<FormFields>) => void;
}
