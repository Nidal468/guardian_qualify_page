"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, Info, Loader2, MicOff, Phone, X } from "lucide-react";
import CallControls from "./call-controls";
import CallFeedback from "./call-feedback";
import type { CallState, CallUIProps } from "./types";

const labels: Record<CallState, string> = {
  idle: "Ready to talk",
  connecting: "Connecting…",
  listening: "Listening to you…",
  thinking: "Carla is thinking…",
  speaking: "Carla is speaking…",
  ended: "Call ended",
  error: "Unable to connect",
};

const tips: Record<CallState, string> = {
  idle: "Tap the button below to start your conversation with Carla.",
  connecting: "Getting everything ready. This takes just a moment…",
  listening: "Speak naturally — Carla understands everyday conversation.",
  thinking: "Carla is processing what you said. She'll respond shortly.",
  speaking: "Carla is responding. Listen and she'll pause when done.",
  ended: "Thanks for chatting! You can call again anytime.",
  error: "Something went wrong. Tap retry to reconnect.",
};

const portrait = "/assets/carla_image.jpeg";

interface MobileCallUIProps extends CallUIProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileCallUI({ open, onClose, ...props }: MobileCallUIProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const statusId = useId();
  const active = ["listening", "thinking", "speaking"].includes(props.callState);
  const inCall = active || props.callState === "connecting";
  const preparingMicrophone = props.callState === "listening" && !props.isMuted && !props.microphoneReady;
  const status = props.isMuted && props.callState === "listening"
    ? "Microphone muted"
    : preparingMicrophone ? "Preparing microphone…"
    : labels[props.callState];

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    if (!mobile.matches) {
      onClose();
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const body = document.body;
    const previousStyle = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    // Fixed body also prevents background scrolling on mobile Safari.
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    // Native modal provides focus containment and makes the background inert.
    dialog.showModal();
    dialog.focus();

    const handleResize = () => {
      // Switching to desktop reveals inline controls without hanging up.
      if (!mobile.matches) onClose();
    };
    mobile.addEventListener("change", handleResize);

    return () => {
      mobile.removeEventListener("change", handleResize);
      dialog.close();
      Object.assign(body.style, previousStyle);
      window.scrollTo(scrollX, scrollY);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  const closeCall = () => {
    if (inCall || props.callState === "error") props.onEndCall();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={statusId}
      onCancel={(event) => {
        event.preventDefault();
        closeCall();
      }}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none overflow-x-hidden overflow-y-auto overscroll-contain border-0 bg-[#0f2418] p-0 text-white outline-none backdrop:bg-[#0f2418] supports-[height:100dvh]:h-dvh"
    >
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <Image unoptimized src={portrait} alt="" fill sizes="100vw" className="scale-125 object-cover opacity-15 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1d4d2b]/50 via-[#0f2418]/80 to-[#0a1a11]" />
        {/* Subtle animated gradient orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-brand-400/20 blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-full flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex shrink-0 items-center justify-between gap-3"
        >
          <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-white/60">
            <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <Headphones className="size-3.5" aria-hidden="true" />
            </span>
            Guardian 1st
          </span>
          <button
            type="button"
            onClick={closeCall}
            aria-label={inCall ? "End call and close" : "Close call screen"}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-4 text-xs font-medium text-white/90 outline-none transition hover:bg-white/15 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/50"
          >
            {inCall ? "End" : "Close"}
            <X className="size-4" aria-hidden="true" />
          </button>
        </motion.header>

        {/* Main content */}
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          {/* Avatar with animated rings */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
            className="relative"
          >
            {/* Pulsing rings when active */}
            {active && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.3], opacity: [0.4, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full border-2 border-brand-400/50"
                />
                <motion.div
                  animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                  className="absolute inset-0 rounded-full border border-brand-400/30"
                />
              </>
            )}
            <div
              className={`relative rounded-full p-1.5 transition-all duration-500 ${
                props.callState === "speaking"
                  ? "bg-gradient-to-br from-brand-400/30 to-brand-600/30 ring-2 ring-brand-400/50"
                  : "bg-white/10 ring-1 ring-white/20"
              }`}
            >
              <Image
                unoptimized
                src={portrait}
                alt="Carla — Guardian 1st advisor"
                width={160}
                height={160}
                className={`size-[clamp(100px,22vh,150px)] rounded-full object-cover ${
                  props.callState === "connecting" ? "motion-safe:animate-[breathe_2s_ease-in-out_infinite]" : ""
                }`}
              />
              {/* Status indicator dot */}
              <span
                className={`absolute bottom-2 right-2 w-5 h-5 rounded-full border-[3px] border-[#0f2418] transition-colors duration-300 ${
                  active ? "bg-green-400" : props.callState === "ended" ? "bg-gray-400" : props.callState === "error" ? "bg-amber-400" : "bg-white/40"
                }`}
                aria-hidden="true"
              />
            </div>
          </motion.div>

          {/* Name and status */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <p className="mt-5 text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40">Your advisor</p>
            <h3 id={titleId} className="mt-1.5 text-[2rem] font-semibold tracking-tight leading-none">
              Carla
            </h3>
            <AnimatePresence mode="wait">
              <motion.p
                id={statusId}
                role="status"
                key={status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="mt-2.5 inline-flex min-h-6 items-center gap-2 text-[15px] text-white/75"
              >
                {(props.callState === "connecting" || preparingMicrophone) && (
                  <Loader2 className="size-4 motion-safe:animate-spin text-brand-300" aria-hidden="true" />
                )}
                {props.isMuted && props.callState === "listening" && (
                  <MicOff className="size-4 text-amber-300" aria-hidden="true" />
                )}
                {status}
              </motion.p>
            </AnimatePresence>
            {(active || props.callState === "ended") && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-1.5 font-mono text-sm tabular-nums text-white/45"
                aria-label={`Call duration ${props.formatTime(props.callDuration)}`}
              >
                {props.formatTime(props.callDuration)}
              </motion.p>
            )}
          </motion.div>

          {/* Audio waveform visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-5 flex h-10 items-center justify-center gap-1"
            aria-hidden="true"
          >
            {[12, 20, 28, 36, 28, 20, 12].map((height, index) => (
              <motion.span
                key={index}
                animate={
                  active && !props.isMuted
                    ? { height: [4, height, 4], opacity: [0.5, 1, 0.5] }
                    : { height: 4, opacity: 0.3 }
                }
                transition={
                  active && !props.isMuted
                    ? { duration: 0.7, repeat: Infinity, ease: "easeInOut", delay: index * 0.08 }
                    : { duration: 0.3 }
                }
                className={`w-1.5 rounded-full ${
                  active && !props.isMuted
                    ? "bg-gradient-to-t from-brand-500 to-brand-300"
                    : "bg-white/25"
                }`}
              />
            ))}
          </motion.div>

          {/* Live transcript */}
          <AnimatePresence>
            {props.transcript && props.callState === "listening" && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="mt-4 w-full max-w-sm"
              >
                <p className="max-h-24 overflow-y-auto rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-3.5 text-sm leading-relaxed text-white/85 border border-white/10">
                  <span className="text-white/50 text-xs block mb-1">You said:</span>
                  &ldquo;{props.transcript}&rdquo;
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Contextual tip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 flex items-start gap-2 max-w-xs mx-auto"
          >
            <Info className="size-4 text-white/35 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-white/45 text-left">{tips[props.callState]}</p>
          </motion.div>

          <div className="w-full max-w-sm mt-2">
            <CallFeedback {...props} variant="mobile" />
          </div>
        </div>

        {/* Footer controls */}
        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="mx-auto w-full max-w-sm shrink-0 pb-1 text-center"
        >
          {inCall ? (
            <>
              {/* Mute indicator */}
              {props.isMuted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-2 text-xs font-medium text-amber-200"
                >
                  <MicOff className="size-3.5" aria-hidden="true" />
                  Microphone is muted
                </motion.div>
              )}
              <CallControls {...props} variant="mobile" />
            </>
          ) : (
            <div className="space-y-3">
              {props.callState === "ended" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-4 text-sm text-white/60"
                >
                  Thanks for chatting with Carla.
                </motion.p>
              )}
              <motion.button
                type="button"
                onClick={props.onStartCall}
                disabled={!props.readyToCall}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-6 text-[15px] font-semibold text-[#14351f] outline-none transition enabled:cursor-pointer enabled:shadow-[0_8px_24px_rgba(255,255,255,0.2)] disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-white/30"
                style={!props.readyToCall ? {} : { animation: "pulse-soft 2.5s ease-in-out infinite" }}
              >
                <span className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center">
                  <Phone className="size-4.5 text-white" aria-hidden="true" />
                </span>
                {props.callState === "error" ? "Retry connection" : props.callState === "ended" ? "Call again" : "Talk to Carla"}
              </motion.button>
              <button
                type="button"
                onClick={closeCall}
                className="min-h-12 w-full cursor-pointer rounded-2xl text-sm font-medium text-white/60 outline-none transition hover:bg-white/10 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Back to your quote
              </button>
            </div>
          )}
        </motion.footer>
      </motion.div>
    </dialog>,
    document.body,
  );
}