"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Mail, MapPin, Phone, User } from "lucide-react";
import confetti from "canvas-confetti";
import type { StepData } from "@/lib/quiz-data";
import { useHasPhysicalKeyboard } from "@/lib/use-keyboard-nav";

const REQUIRED_ANSWER_KEYS = [
  "first_time", "protection_for", "priority", "alarm",
  "alone_time", "fall_worry", "discreet", "contact_preference",
] as const;

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
  onGoPrev: () => void;
  onSubmitted: (data: LeadFormData) => void;
}

type FieldErrors = Partial<Record<"name" | "phone" | "email" | "postcode" | "contactMethod", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

function validateField(field: keyof FieldErrors, value: string): string {
  switch (field) {
    case "name": {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 100) return "Please enter your full name";
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

// Ported from the Battery 1st landing page (green brand palette, double burst).
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
  `w-full rounded-xl border-2 bg-white pl-12 pr-4 py-3.5 text-base sm:text-[17px] text-gray-900 placeholder:text-gray-400 transition-all duration-200 focus:outline-none focus:ring-4 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-200 focus:border-brand-500 focus:ring-brand-500/15 hover:border-gray-300"
  }`;

export default function LeadForm({ currentStep, idx, answers, onGoPrev, onSubmitted }: LeadFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [postcode, setPostcode] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const hasKeyboard = useHasPhysicalKeyboard();

  // Refs for keyboard navigation
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const postcodeRef = useRef<HTMLInputElement>(null);

  const focusNext = useCallback((current: "name" | "phone" | "email" | "postcode") => {
    const order = { name: phoneRef, phone: emailRef, email: postcodeRef, postcode: null };
    order[current]?.current?.focus();
  }, []);

  const handleInputKeyDown = useCallback(
    (field: "name" | "phone" | "email" | "postcode") => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (field === "postcode") {
          // Focus contact method or submit
          const form = event.currentTarget.closest("form");
          const submitBtn = form?.querySelector<HTMLButtonElement>("button[type='submit']");
          submitBtn?.focus();
        } else {
          focusNext(field);
        }
      }
    },
    [focusNext],
  );

  const validateAll = useCallback((): FieldErrors => {
    const next: FieldErrors = {};
    for (const [field, value] of [
      ["name", name],
      ["phone", phone],
      ["email", email],
      ["postcode", postcode],
      ["contactMethod", contactMethod],
    ] as const) {
      const message = validateField(field, value);
      if (message) next[field] = message;
    }
    return next;
  }, [name, phone, email, postcode, contactMethod]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (inFlight.current || submitting) return;
      setSubmitError("");
      const fieldErrors = validateAll();
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length > 0) return;

      // Validate all required quiz answers are present
      const missingAnswers = REQUIRED_ANSWER_KEYS.filter((key) => !answers[key]);
      if (missingAnswers.length > 0) {
        setSubmitError("Please complete all quiz questions before submitting.");
        return;
      }

      inFlight.current = true;
      setSubmitting(true);
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            phone: normalizePhone(phone),
            email: email.trim().toLowerCase(),
            postcode: postcode.trim().toUpperCase(),
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
          const lead: LeadFormData = {
            name: name.trim(),
            phone: normalizePhone(phone),
            email: email.trim().toLowerCase(),
            postcode: postcode.trim().toUpperCase(),
            contactMethod: contactMethod as "phone" | "email",
          };
          onSubmitted(lead);
          fireConfetti();
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
    [answers, contactMethod, email, name, onSubmitted, phone, postcode, submitting, validateAll],
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <motion.div
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
        <h3 className="text-gray-900 font-bold text-xl sm:text-2xl md:text-[27px] leading-snug tracking-tight text-center">
          {currentStep.title}
        </h3>
      </div>

      <motion.form
        noValidate
        onSubmit={handleSubmit}
        className="mt-6 grid grid-cols-1 gap-4 max-w-xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Name field */}
        <motion.div variants={itemVariants}>
          <label htmlFor="lead-name" className="block text-sm font-semibold text-gray-700 mb-1.5">
            Full name
          </label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              ref={nameRef}
              id="lead-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleInputKeyDown("name")}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "lead-name-error" : undefined}
              className={inputClass(Boolean(errors.name))}
              placeholder="Your full name"
            />
          </div>
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              id="lead-name-error"
              role="alert"
              className="mt-1.5 text-sm font-medium text-red-600"
            >
              {errors.name}
            </motion.p>
          )}
        </motion.div>

        {/* Phone field */}
        <motion.div variants={itemVariants}>
          <label htmlFor="lead-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
            Phone number
          </label>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              ref={phoneRef}
              id="lead-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={handleInputKeyDown("phone")}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "lead-phone-error" : undefined}
              className={inputClass(Boolean(errors.phone))}
              placeholder="e.g. 07123 456789"
            />
          </div>
          {errors.phone && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              id="lead-phone-error"
              role="alert"
              className="mt-1.5 text-sm font-medium text-red-600"
            >
              {errors.phone}
            </motion.p>
          )}
        </motion.div>

        {/* Email field */}
        <motion.div variants={itemVariants}>
          <label htmlFor="lead-email" className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              ref={emailRef}
              id="lead-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={handleInputKeyDown("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "lead-email-error" : undefined}
              className={inputClass(Boolean(errors.email))}
              placeholder="you@example.com"
            />
          </div>
          {errors.email && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              id="lead-email-error"
              role="alert"
              className="mt-1.5 text-sm font-medium text-red-600"
            >
              {errors.email}
            </motion.p>
          )}
        </motion.div>

        {/* Postcode field */}
        <motion.div variants={itemVariants}>
          <label htmlFor="lead-postcode" className="block text-sm font-semibold text-gray-700 mb-1.5">
            Property postcode
          </label>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              ref={postcodeRef}
              id="lead-postcode"
              name="postcode"
              type="text"
              autoComplete="postal-code"
              maxLength={8}
              value={postcode}
              onChange={(event) => setPostcode(event.target.value.toUpperCase())}
              onKeyDown={handleInputKeyDown("postcode")}
              aria-invalid={Boolean(errors.postcode)}
              aria-describedby={errors.postcode ? "lead-postcode-error" : undefined}
              className={`${inputClass(Boolean(errors.postcode))} uppercase`}
              placeholder="e.g. SW1A 1AA"
            />
          </div>
          {errors.postcode && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              id="lead-postcode-error"
              role="alert"
              className="mt-1.5 text-sm font-medium text-red-600"
            >
              {errors.postcode}
            </motion.p>
          )}
        </motion.div>

        {/* Contact method - iOS segmented control style */}
        <motion.fieldset variants={itemVariants}>
          <legend className="block text-sm font-semibold text-gray-700 mb-2">
            How should we contact you?
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
                aria-checked={contactMethod === method}
                onClick={() => setContactMethod(method)}
                whileTap={{ scale: 0.97 }}
                className={`relative flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm sm:text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                  contactMethod === method
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
                {contactMethod === method && (
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
          {errors.contactMethod && (
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

        {submitError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            role="alert"
            className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm sm:text-base font-medium text-red-700"
          >
            {submitError}
          </motion.div>
        )}

        {/* Submit button */}
        <motion.div variants={itemVariants}>
          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={submitting ? {} : { scale: 1.01 }}
            whileTap={submitting ? {} : { scale: 0.98 }}
            className={`w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-base sm:text-lg px-6 py-4 shadow-[0_4px_16px_rgba(46,122,69,0.3)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 flex items-center justify-center gap-2.5 ${
              submitting ? "opacity-80 cursor-wait" : "cursor-pointer"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 motion-safe:animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                Request My Free Assessment
                <span className="hidden sm:inline text-brand-200 font-normal text-sm ml-1">↵</span>
              </>
            )}
          </motion.button>

          {hasKeyboard && (
            <p className="mt-2 text-center text-xs text-gray-400" aria-hidden="true">
              Press <span className="kbd-hint">Enter ↵</span> in each field to move to the next
            </p>
          )}
        </motion.div>

        <motion.p variants={itemVariants} className="text-center text-xs sm:text-sm text-gray-400 leading-relaxed">
          We&apos;ll only use your details to arrange your free home assessment. See our{" "}
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
      </motion.form>
    </motion.div>
  );
}