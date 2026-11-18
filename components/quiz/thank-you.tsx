"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, ClipboardList, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";

interface ThankYouProps {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  onProceedToCall: () => void;
}

/* Compact animated checkmark */
function AnimatedCheckmark() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
      className="relative mx-auto w-12 h-12 sm:w-14 sm:h-14"
    >
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute inset-0 rounded-full bg-brand-100/60"
        style={{ animation: "ring-pulse 2.5s ease-in-out infinite 0.8s" }}
      />
      <svg viewBox="0 0 52 52" className="relative w-full h-full" aria-hidden="true">
        <motion.circle
          cx="26" cy="26" r="24"
          fill="none" stroke="url(#checkGradient)" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.65, 0, 0.45, 1] }}
        />
        <motion.path
          d="M14 27l8 8 16-16"
          fill="none" stroke="url(#checkGradient)" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: 0.6, ease: [0.65, 0, 0.45, 1] }}
        />
        <defs>
          <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#418f57" />
            <stop offset="100%" stopColor="#2e7a45" />
          </linearGradient>
        </defs>
      </svg>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="absolute -top-1 -right-1 text-brand-400"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </motion.div>
    </motion.div>
  );
}

/* Compact horizontal next-steps row */
function NextSteps() {
  const steps = [
    { icon: ClipboardList, label: "We review" },
    { icon: CalendarCheck, label: "Book visit" },
    { icon: ShieldCheck, label: "Get plan" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.4 }}
      className="mt-3 flex items-center justify-center gap-3 sm:gap-4"
    >
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="w-4 h-px bg-brand-200" aria-hidden="true" />
          )}
          <div className="flex flex-col items-center gap-0.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <step.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600" strokeWidth={2} />
            </span>
            <span className="text-[10px] sm:text-[11px] font-medium text-gray-500">{step.label}</span>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export default function ThankYou({ firstName, lastName, phone, email, onProceedToCall }: ThankYouProps) {
  const displayName = firstName || undefined;
  void lastName; // available for future use

  useEffect(() => {
    const timer = setTimeout(() => {
      onProceedToCall();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onProceedToCall]);

  return (
    <div className="text-center py-2 sm:py-3">
      <AnimatedCheckmark />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <h3 className="mt-2 text-base sm:text-lg font-bold text-gray-900">
          Thank you{displayName ? `, ${displayName}` : ""}!
        </h3>
        <p className="mt-1 text-gray-500 text-xs sm:text-sm leading-snug">
          Your free home audit request has been received.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.65, duration: 0.3 }}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100"
      >
        <PhoneCall className="w-3 h-3 text-brand-600" aria-hidden="true" />
        <span className="text-[11px] sm:text-xs font-medium text-brand-800">
          We'll contact you {phone ? `on ${phone}` : email ? `at ${email}` : "soon"}
        </span>
      </motion.div>

      <NextSteps />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.3 }}
        className="mt-3 text-[11px] text-gray-400"
      >
        Connecting you with Carla...
      </motion.p>
    </div>
  );
}