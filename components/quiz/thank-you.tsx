"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, ClipboardList, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";

interface ThankYouProps {
  name: string;
  phone?: string;
  email?: string;
  onProceedToCall: () => void;
}

/* Animated SVG checkmark with draw effect */
function AnimatedCheckmark() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
      className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20"
    >
      {/* Glow ring */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="absolute inset-0 rounded-full bg-brand-100/60"
        style={{ animation: "ring-pulse 2.5s ease-in-out infinite 1s" }}
      />
      <svg viewBox="0 0 52 52" className="relative w-full h-full" aria-hidden="true">
        {/* Circle */}
        <motion.circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="url(#checkGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.65, 0, 0.45, 1] }}
        />
        {/* Checkmark */}
        <motion.path
          d="M14 27l8 8 16-16"
          fill="none"
          stroke="url(#checkGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.8, ease: [0.65, 0, 0.45, 1] }}
        />
        <defs>
          <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#418f57" />
            <stop offset="100%" stopColor="#2e7a45" />
          </linearGradient>
        </defs>
      </svg>
      {/* Sparkle decorations */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute -top-1 -right-1 text-brand-400"
      >
        <Sparkles className="w-4 h-4" />
      </motion.div>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute -bottom-1 -left-1 text-brand-300"
      >
        <Sparkles className="w-3 h-3" />
      </motion.div>
    </motion.div>
  );
}

/* Next steps timeline component */
function NextSteps() {
  const steps = [
    {
      icon: ClipboardList,
      title: "We review your answers",
      desc: "Our team prepares your personalised assessment",
    },
    {
      icon: CalendarCheck,
      title: "Book your free visit",
      desc: "We'll contact you to arrange a convenient time",
    },
    {
      icon: ShieldCheck,
      title: "Get your recommendation",
      desc: "Receive your tailored protection plan — no obligation",
    },
  ];

  return (
    <div className="mt-4 sm:mt-5">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center mb-3">
        What happens next
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex sm:flex-col items-start sm:items-center gap-2 sm:gap-2 p-3 sm:p-4 rounded-xl bg-gradient-to-br from-brand-50/80 to-white border border-brand-100/60 text-left sm:text-center"
          >
            {/* Step number badge */}
            <span className="absolute top-2 right-2 sm:top-2 sm:right-2 w-4 h-4 rounded-full bg-brand-100 text-brand-600 text-[9px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white shadow-[0_2px_8px_rgba(46,122,69,0.12)] flex items-center justify-center shrink-0">
              <step.icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" strokeWidth={2} />
            </span>
            <div>
              <p className="font-semibold text-xs sm:text-sm text-gray-900 leading-snug">{step.title}</p>
              <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function ThankYou({ name, phone, email, onProceedToCall }: ThankYouProps) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const firstName = first || undefined;

  // Auto-switch to Carla call page after 1.5s
  useEffect(() => {
    const timer = setTimeout(() => {
      onProceedToCall();
    }, 1500);
    return () => clearTimeout(timer);
  }, [onProceedToCall]);

  return (
    <div className="text-center">
      {/* Animated success checkmark */}
      <AnimatedCheckmark />

      {/* Success message with staggered animation */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3 className="mt-3 text-lg sm:text-xl font-bold text-gray-900">
          Thank you{firstName ? `, ${firstName}` : ""}!
        </h3>
        <p className="mt-2 text-gray-600 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
          Your free home assessment request has been received.
        </p>
      </motion.div>

      {/* Contact confirmation pill */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100"
      >
        <PhoneCall className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
        <span className="text-xs sm:text-sm font-medium text-brand-800">
          We'll contact you {phone ? `on ${phone}` : email ? `at ${email}` : "soon"}
        </span>
      </motion.div>

      {/* What happens next - informative UI */}
      <NextSteps />

      {/* Auto-transitioning message */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="mt-4 text-xs text-gray-400"
      >
        Connecting you with Carla...
      </motion.p>
    </div>
  );
}
