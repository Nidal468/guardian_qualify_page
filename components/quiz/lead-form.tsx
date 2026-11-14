"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, Mail, MapPin, Phone, User } from "lucide-react";
import confetti from "canvas-confetti";
import { STEPS, TOTAL_STEPS } from "@/lib/quiz-data";
import type { StepData } from "@/lib/quiz-data";
import { useHasPhysicalKeyboard } from "@/lib/use-keyboard-nav";
import type { FormFields } from "@/lib/use-quiz-state";

const REQUIRED_ANSWER_KEYS = [
  "first_time", "protection_for", "priority", "alarm",
  "alone_time", "fall_worry", "discreet", "contact_preference",
] as const;

const ANSWER_KEY_TITLES: Record<string, string> = Object.fromEntries(
  STEPS.filter((s) => !s.isInput).map((s) => [s.key, s.title])
);

function buildMissingAnswersMessage(missingKeys: string[]): string {
  const titles = missingKeys.map((key) => ANSWER_KEY_TITLES[key] || key);
  return `Please answer the following before submitting:\n${titles.map((t) => `• ${t}`).join("\n")}`;
}

export interface LeadFormData {
  name: string;
  phone: string;
  email: string;
  postcode: string;
  contactMethod: "phone" | "email";
}

interface LeadFormProps {
  currentStep: StepData;
  idx: number;
  answers: Record<string, string>;
  formFields: FormFields;
  updateFormFields: (fields: Partial<FormFields>) => void;
  onGoPrev: () => void;
  onGoNext: () => void;
  onSubmitted: (data: LeadFormData) => void;
}

type FieldName = "firstName" | "lastName" | "phone" | "email" | "postcode" | "contactMethod";
type FieldErrors = Partial<Record<FieldName, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

function validateField(field: FieldName, value: string): string {
  switch (field) {
    case "firstName": {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 100) return "Please enter your first name";
      return "";
    }
    case "lastName": {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 100) return "Please enter your last name";
      return "";
    }
    case "phone": {
      const normalized = normalizePhone(value);
      if (!/^(?:\+44\d{8,14}|0\d{9,10}|\d{10,11})$/.test(normalized)) return "Please enter a valid UK phone number";
      return "";
    }
    case "email": {
      const trimmed = value.trim();
      if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return "Please enter a valid email address";
      return "";
    }
    case "postcode": {
      const trimmed = value.trim().toUpperCase();
      if (!POSTCODE_RE.test(trimmed)) return "Please enter a valid UK postcode";
      return "";
    }
    case "contactMethod": {
      if (value !== "phone" && value !== "email") return "Please choose how you'd like to be contacted";
      return "";
    }
  }
}

// Same GHL webhook trigger as the Battery 1st qualification quiz.
const GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/mT1ydY9XA0GOQLyWcJWq/webhook-trigger/d9716cb1-9e8e-405f-a533-a9841f16a8fc";

function fireConfetti() {
  const colors = ["#37ca37", "#26472b", "#ffffff", "#d4b24c"];
  confetti({ spread: 70, ticks: 240, gravity: 0.85, decay: 0.94, startVelocity: 38, colors, scalar: 0.9 });
  setTimeout(() => {
    confetti({ spread: 100, particleCount: 30, angle: 90, origin: { x: 0.5, y: 0.6 }, scalar: 1.0, colors });
  }, 180);
}

function notifyGhlWebhook(payload: Record<string, string>) {
  fetch(GHL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error("Failed to submit form data:", error);
  });
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border-2 bg-white pl-12 pr-4 py-3 text-base sm:text-[17px] text-gray-900 placeholder:text-gray-400 transition-all duration-200 focus:outline-none focus:ring-4 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-200 focus:border-brand-500 focus:ring-brand-500/15 hover:border-gray-300"
  }`;

const FIELD_META: Record<FieldName, { label: string; placeholder: string; type: string; autoComplete: string; icon: typeof User; maxLength?: number; inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"; uppercase?: boolean }> = {
  firstName: { label: "First name", placeholder: "First name", type: "text", autoComplete: "given-name", icon: User, maxLength: 100 },
  lastName: { label: "Last name", placeholder: "Last name", type: "text", autoComplete: "family-name", icon: User, maxLength: 100 },
  phone: { label: "Phone number", placeholder: "07…", type: "tel", autoComplete: "tel", icon: Phone, maxLength: 20, inputMode: "tel" },
  email: { label: "Email address", placeholder: "you@example.com", type: "email", autoComplete: "email", icon: Mail, maxLength: 254 },
  postcode: { label: "Postcode", placeholder: "e.g. SK8 2GL", type: "text", autoComplete: "postal-code", icon: MapPin, maxLength: 8, uppercase: true },
  contactMethod: { label: "How should we contact you?", placeholder: "", type: "", autoComplete: "", icon: Phone },
};

export default function LeadForm({ currentStep, idx, answers, formFields, updateFormFields, onGoPrev, onGoNext, onSubmitted }: LeadFormProps) {
  const fields = currentStep.inputFields ?? [];
  const isLastStep = idx === TOTAL_STEPS - 1;
  const [backLocked, setBackLocked] = useState(false);
  const [continueLocked, setContinueLocked] = useState(false);

  const handleBackClick = useCallback(() => {
    if (backLocked) return;
    setBackLocked(true);
    onGoPrev();
    setTimeout(() => setBackLocked(false), 300);
  }, [backLocked, onGoPrev]);

  // Local state mirrors formFields for the current step's fields so inputs are controlled
  const [local, setLocal] = useState<FormFields>(() => {
    const init: FormFields = {};
    for (const f of fields) {
      if (f === "contactMethod") {
        init[f] = formFields.contactMethod || "";
      } else {
        init[f] = formFields[f] ?? "";
      }
    }
    return init;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const hasKeyboard = useHasPhysicalKeyboard();

  // Sync local state when step changes
  useEffect(() => {
    const next: FormFields = {};
    for (const f of fields) {
      if (f === "contactMethod") {
        next[f] = formFields.contactMethod || "";
      } else {
        next[f] = formFields[f] ?? "";
      }
    }
    setLocal(next);
    setErrors({});
    setSubmitError("");
  }, [currentStep.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs for keyboard navigation
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateLocal = useCallback((field: FieldName, value: string) => {
    setLocal((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user types
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validateCurrentFields = useCallback((): FieldErrors => {
    const next: FieldErrors = {};
    for (const field of fields) {
      const value = (local as Record<string, string | undefined>)[field] ?? "";
      const message = validateField(field, value);
      if (message) next[field] = message;
    }
    return next;
  }, [fields, local]);

  const handleContinue = useCallback(() => {
    const fieldErrors = validateCurrentFields();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    // Check if any option-based quiz questions are still unanswered
    const missingAnswers = REQUIRED_ANSWER_KEYS.filter((key) => !answers[key]);
    if (missingAnswers.length > 0) {
      setSubmitError(buildMissingAnswersMessage(missingAnswers));
      return;
    }

    // Save to shared state
    updateFormFields(local);
    // Fire confetti when postcode step is completed
    if (currentStep.key === "form_postcode") {
      fireConfetti();
    }
    onGoNext();
  }, [validateCurrentFields, local, updateFormFields, onGoNext, answers, currentStep.key]);

  const handleContinueClick = useCallback(() => {
    if (continueLocked) return;
    setContinueLocked(true);
    handleContinue();
    setTimeout(() => setContinueLocked(false), 300);
  }, [continueLocked, handleContinue]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (inFlight.current || submitting) return;
      setSubmitError("");

      const fieldErrors = validateCurrentFields();
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length > 0) return;

      // Merge with shared state for complete data
      const allFields: FormFields = { ...formFields, ...local };

      // Validate all required quiz answers are present
      const missingAnswers = REQUIRED_ANSWER_KEYS.filter((key) => !answers[key]);
      if (missingAnswers.length > 0) {
        setSubmitError(buildMissingAnswersMessage(missingAnswers));
        return;
      }

      const firstName = (allFields.firstName ?? "").trim();
      const lastName = (allFields.lastName ?? "").trim();
      const name = `${firstName} ${lastName}`.trim();
      const phone = normalizePhone(allFields.phone ?? "");
      const email = (allFields.email ?? "").trim().toLowerCase();
      const postcode = (allFields.postcode ?? "").trim().toUpperCase();
      // Default to phone since the contact method step was removed
      const contactMethod: "phone" | "email" = allFields.contactMethod || "phone";

      inFlight.current = true;
      setSubmitting(true);
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            email,
            postcode,
            contactMethod,
            answers,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: FieldErrors;
        };
        if (!response.ok) {
          if (data.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
            setErrors(data.fieldErrors);
            return;
          }
          setSubmitError(
            data.error || "Something went wrong sending your request. Please try again.",
          );
        } else {
          const lead: LeadFormData = { name, phone, email, postcode, contactMethod };
          onSubmitted(lead);
          notifyGhlWebhook({
            ...answers,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            postcode: lead.postcode,
            contact_method: lead.contactMethod,
          });
        }
      } catch {
        setSubmitError("Something went wrong sending your request. Please check your connection and try again.");
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [answers, formFields, local, onSubmitted, submitting, validateCurrentFields],
  );

  const handleInputKeyDown = useCallback(
    (field: FieldName) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const fieldIdx = fields.indexOf(field);
        const nextField = fields[fieldIdx + 1];
        if (nextField && nextField !== "contactMethod") {
          inputRefs.current[nextField]?.focus();
        } else if (isLastStep) {
          // Focus submit button
          const form = event.currentTarget.closest("form");
          const submitBtn = form?.querySelector<HTMLButtonElement>("button[type='submit']");
          submitBtn?.focus();
        } else {
          handleContinue();
        }
      }
    },
    [fields, isLastStep, handleContinue],
  );

  const renderField = (field: FieldName) => {
    if (field === "contactMethod") return null; // handled separately
    const meta = FIELD_META[field];
    const value = (local as Record<string, string | undefined>)[field] ?? "";
    const Icon = meta.icon;
    const hasError = Boolean(errors[field]);

    return (
      <motion.div
        key={field}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <label htmlFor={`lead-${field}`} className="block text-sm font-semibold text-gray-700 mb-1">
          {meta.label}
        </label>
        <div className="relative">
          <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
          <input
            ref={(el) => { inputRefs.current[field] = el; }}
            id={`lead-${field}`}
            name={field}
            type={meta.type}
            inputMode={meta.inputMode}
            autoComplete={meta.autoComplete}
            maxLength={meta.maxLength}
            value={value}
            onChange={(event) => updateLocal(field, meta.uppercase ? event.target.value.toUpperCase() : event.target.value)}
            onKeyDown={handleInputKeyDown(field)}
            aria-invalid={hasError}
            aria-describedby={hasError ? `lead-${field}-error` : undefined}
            className={`${inputClass(hasError)}${meta.uppercase ? " uppercase" : ""}`}
            placeholder={meta.placeholder}
          />
        </div>
        {errors[field] && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            id={`lead-${field}-error`}
            role="alert"
            className="mt-1.5 text-sm font-medium text-red-600"
          >
            {errors[field]}
          </motion.p>
        )}
      </motion.div>
    );
  };

  const renderContactMethod = () => {
    const value = (local as Record<string, string | undefined>).contactMethod ?? "";
    const hasError = Boolean(errors.contactMethod);

    return (
      <motion.fieldset
        key="contactMethod"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <legend className="block text-sm font-semibold text-gray-700 mb-1.5">
          {FIELD_META.contactMethod.label}
        </legend>
        <div
          role="radiogroup"
          aria-label="Preferred contact method"
          className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100/80 rounded-xl"
        >
          {(["phone", "email"] as const).map((method) => (
            <motion.button
              key={method}
              type="button"
              role="radio"
              aria-checked={value === method}
              onClick={() => updateLocal("contactMethod", method)}
              whileTap={{ scale: 0.97 }}
              className={`relative flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm sm:text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                value === method
                  ? "bg-white text-brand-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {method === "phone" ? (
                <Phone className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Mail className="w-4 h-4" aria-hidden="true" />
              )}
              {method === "phone" ? "Phone" : "Email"}
              {value === method && (
                <motion.span
                  layoutId="contact-check"
                  className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>
        {hasError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="mt-1.5 text-sm font-medium text-red-600"
          >
            {errors.contactMethod}
          </motion.p>
        )}
      </motion.fieldset>
    );
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
              disabled={backLocked}
              onClick={handleBackClick}
              aria-label="Previous question"
              whileHover={backLocked ? {} : { scale: 1.05 }}
              whileTap={backLocked ? {} : { scale: 0.95 }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-gray-200 bg-white text-brand-700 flex items-center justify-center transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          )}
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="text-gray-900 font-bold text-lg sm:text-xl md:text-[23px] leading-snug tracking-tight text-center"
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

        <form
          noValidate
          onSubmit={isLastStep ? handleSubmit : (e) => { e.preventDefault(); handleContinueClick(); }}
          className={`mt-3 grid gap-2.5 max-w-xl mx-auto ${fields.length === 2 && !fields.includes("contactMethod") ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
        >
          {fields.map((field) =>
            field === "contactMethod" ? renderContactMethod() : renderField(field)
          )}

          {submitError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              role="alert"
              className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm sm:text-base font-medium text-red-700 whitespace-pre-line"
            >
              {submitError}
            </motion.div>
          )}

          {/* Action button */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={submitting ? {} : { scale: 1.01 }}
              whileTap={submitting ? {} : { scale: 0.98 }}
              className={`w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-base sm:text-lg px-6 py-3.5 shadow-[0_4px_16px_rgba(46,122,69,0.3)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 flex items-center justify-center gap-2.5 ${
                submitting ? "opacity-80 cursor-wait" : "cursor-pointer"
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 motion-safe:animate-spin" aria-hidden="true" />
                  Sending…
                </>
              ) : isLastStep ? (
                <>
                  Request My Free Assessment
                  <span className="hidden sm:inline text-brand-200 font-normal text-sm ml-1">↵</span>
                </>
              ) : currentStep.key === "form_postcode" ? (
                <>
                  Check My Area
                  <span className="hidden sm:inline text-brand-200 font-normal text-sm ml-1">→</span>
                </>
              ) : (
                <>
                  Continue
                  <span className="hidden sm:inline text-brand-200 font-normal text-sm ml-1">→</span>
                </>
              )}
            </motion.button>

            {hasKeyboard && (
              <p className="mt-2 text-center text-xs text-gray-400" aria-hidden="true">
                Press <span className="kbd-hint">Enter ↵</span> to continue
              </p>
            )}
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-center text-xs sm:text-sm text-gray-400 leading-snug mt-1">
            We'll only use your details to arrange your free home assessment. See our{" "}
            <a
              href="https://guardian1st.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              privacy policy
            </a>
            .
          </motion.p>
        </form>
      </motion.div>
    </AnimatePresence>
  );
}