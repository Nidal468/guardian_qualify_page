"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, ClipboardList, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { DesktopCallUI, MobileCallUI, useCall } from "./call-interface";
import { useContact } from "./call-interface/use-contact";
import type { CallUIProps } from "./call-interface/types";

interface DoneScreenProps {
  name: string;
  phone?: string;
  email?: string;
}

const GHL_WIDGET_ID = process.env.NEXT_PUBLIC_GHL_WIDGET_ID;

/* Animated SVG checkmark with draw effect */
function AnimatedCheckmark() {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
      className="relative mx-auto w-20 h-20 sm:w-24 sm:h-24"
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
        <Sparkles className="w-5 h-5" />
      </motion.div>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute -bottom-1 -left-1 text-brand-300"
      >
        <Sparkles className="w-4 h-4" />
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
      desc: "We&apos;ll contact you to arrange a convenient time",
    },
    {
      icon: ShieldCheck,
      title: "Get your recommendation",
      desc: "Receive your tailored protection plan — no obligation",
    },
  ];

  return (
    <div className="mt-6 sm:mt-8">
      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide text-center mb-4">
        What happens next
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-brand-50/80 to-white border border-brand-100/60 text-left sm:text-center"
          >
            {/* Step number badge */}
            <span className="absolute top-2 right-2 sm:top-3 sm:right-3 w-5 h-5 rounded-full bg-brand-100 text-brand-600 text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white shadow-[0_2px_8px_rgba(46,122,69,0.12)] flex items-center justify-center shrink-0">
              <step.icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" strokeWidth={2} />
            </span>
            <div>
              <p className="font-semibold text-sm sm:text-[15px] text-gray-900 leading-snug">{step.title}</p>
              <p className="mt-0.5 text-xs sm:text-[13px] text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function QuizDone({ name, phone, email }: DoneScreenProps) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const firstName = first || undefined;
  const lastName = rest.join(" ") || undefined;

  const contact = useContact(email);
  const call = useCall({ email, phone, firstName, lastName, ghlContactId: contact.contactId });
  const [mobileCallOpen, setMobileCallOpen] = useState(false);
  const closeMobileCall = useCallback(() => setMobileCallOpen(false), []);
  const openMobileCall = () => setMobileCallOpen(true);
  const startCall = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setMobileCallOpen(true);
    // Keep audio initialization directly in the user's click gesture.
    call.startCall();
  };

  // Keyboard: Enter to start call when idle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON";
      if (event.key === "Enter" && !isInput && call.callState === "idle" && contact.ready) {
        event.preventDefault();
        startCall();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [call.callState, contact.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const props: CallUIProps = {
    callState: call.callState,
    callDuration: call.callDuration,
    transcript: call.transcript,
    isMuted: call.isMuted,
    microphoneReady: call.microphoneReady,
    microphoneWarning: call.microphoneWarning,
    readyToCall: contact.ready,
    lookupPending: contact.loading,
    lookupError: contact.error,
    error: call.error,
    needsAudioPermission: call.needsAudioPermission,
    onStartCall: startCall,
    onEndCall: call.endCall,
    onToggleMute: call.toggleMute,
    onRetryMicrophone: call.retryMicrophone,
    onResumeAudio: call.resumeAudio,
    onRetryLookup: contact.retry,
    onSkipLookup: contact.continueWithoutContact,
    formatTime: call.formatTime,
  };

  return (
    <>
      {GHL_WIDGET_ID && (
        <Script
          src="https://widgets.leadconnectorhq.com/loader.js"
          data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
          data-widget-id={GHL_WIDGET_ID}
          strategy="afterInteractive"
        />
      )}

      <div className="text-center">
        {/* Animated success checkmark */}
        <AnimatedCheckmark />

        {/* Success message with staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="mt-5 text-xl sm:text-2xl font-bold text-gray-900">
            Thank you{firstName ? `, ${firstName}` : ""}! 🎉
          </h3>
          <p className="mt-2.5 text-gray-600 text-base sm:text-lg leading-relaxed max-w-md mx-auto">
            Your free home assessment request has been received. We&apos;ll be in touch to discuss your requirements and arrange a convenient time.
          </p>
        </motion.div>

        {/* Contact confirmation pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.4 }}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-100"
        >
          <PhoneCall className="w-4 h-4 text-brand-600" aria-hidden="true" />
          <span className="text-sm font-medium text-brand-800">
            We&apos;ll contact you {phone ? `on ${phone}` : email ? `at ${email}` : "soon"}
          </span>
        </motion.div>
      </div>

      {/* What happens next - informative UI */}
      <NextSteps />

      {/* Call Carla section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8"
      >
        <DesktopCallUI {...props} onOpenMobileCall={openMobileCall} />
        <MobileCallUI {...props} open={mobileCallOpen} onClose={closeMobileCall} />
      </motion.div>
    </>
  );
}