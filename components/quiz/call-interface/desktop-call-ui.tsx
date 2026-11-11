"use client";


import { ArrowRight, Check, Headphones, Loader2, Mic, Phone } from "lucide-react";
import CallButton from "./call-button";
import CallControls from "./call-controls";
import CallFeedback from "./call-feedback";
import type { CallState, CallUIProps } from "./types";

const labels: Record<CallState, string> = {
  idle: "Ready when you are",
  connecting: "Connecting to Carla…",
  listening: "Carla is listening",
  thinking: "Carla is thinking…",
  speaking: "Carla is speaking",
  ended: "Call complete",
  error: "Let’s get you reconnected",
};

interface DesktopCallUIProps extends CallUIProps {
  onOpenMobileCall: () => void;
}

// Shared landing experience; only the in-call controls differ on mobile.
export default function DesktopCallUI(props: DesktopCallUIProps) {
  const inCall = ["connecting", "listening", "thinking", "speaking"].includes(props.callState);
  const status = props.lookupPending ? "Getting everything ready…"
    : props.isMuted && props.callState === "listening" ? "Your microphone is muted"
      : props.callState === "listening" && !props.microphoneReady ? "Preparing microphone…"
        : labels[props.callState];

  return (
    <section className="w-full text-[#26472b]" aria-label="Talk to Carla">
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-8">
        <div className="relative mx-auto w-45 md:w-65 overflow-hidden rounded-3xl border border-[#dce9df] bg-[#f1f7f2] transition-transform duration-300 hover:scale-[1.02]">
          <img
            src="/assets/carla_image.jpeg"
            alt="Carla — Guardian 1st advisor"
            className="w-full object-cover"
          />
          {(props.callState === "speaking" || props.callState === "listening") && (
            <div
              className="absolute inset-0 rounded-3xl"
              style={{ animation: "ring-pulse 2s ease-in-out infinite", boxShadow: "0 0 0 0 rgba(55, 163, 76, 0.3)" }}
              aria-hidden="true"
            />
          )}
          {props.callState === "connecting" && (
            <div
              className="absolute inset-0 rounded-3xl bg-[#37a34c]/10"
              style={{ animation: "breathe 2s ease-in-out infinite" }}
              aria-hidden="true"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#18351f] via-[#18351f]/80 to-transparent px-5 pb-5 pt-12 text-white">
            <p className="text-xl font-bold">Carla</p>
            <p className="mt-0.5 text-sm text-white/80">Your Guardian 1st advisor</p>
          </div>
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm">
            <Headphones className="size-3.5" aria-hidden="true" />
            Here to help
          </div>
        </div>

        <div className="min-w-0 text-center md:text-left">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#edf7ee] px-3 py-1.5 text-[8px] font-bold tracking-[0.12em] uppercase text-[#34733e]">
            <Check className="size-3" aria-hidden="true" />
            Final step — you’re almost there
          </p>
          <h3 className="text-xl leading-[1.15] font-extrabold tracking-tight lg:text-4xl">
            Skip the wait.<br />
            Talk to Carla now.
          </h3>
          <p className="mt-4 text-[12px] leading-relaxed text-gray-600 md:text-base">
            Get instant answers, see if you qualify, and lock in your free
            12-month fixed quote. No waiting for a callback.
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-[#526957] md:justify-start">
            <li className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-[#34733e]" aria-hidden="true" />
              Free quote
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-[#34733e]" aria-hidden="true" />
              No obligation
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-[#34733e]" aria-hidden="true" />
              In your own time
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-7 rounded-2xl border border-[#dfeae1] bg-[#f6faf7] p-4 sm:p-5">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
            <p role="status" key={status} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ animation: "fade-in 0.3s ease-out" }}>
              {props.callState === "connecting" || props.lookupPending || (props.callState === "listening" && !props.isMuted && !props.microphoneReady) ? (
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <span className={`size-2 rounded-full ${props.callState === "error" ? "bg-amber-500" : props.callState === "ended" ? "bg-gray-400" : "bg-[#37a34c]"}`} aria-hidden="true" />
              )}
              {status}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {props.callState === "ended"
                ? `Thanks for chatting · ${props.formatTime(props.callDuration)}`
                : inCall
                  ? "Take your time. Carla will listen after answering."
                  : "A voice call, right here in your browser."}
            </p>
          </div>

          {!inCall && (
            <CallButton callState={props.callState} readyToCall={props.readyToCall} onStartCall={props.onStartCall} />
          )}
          {inCall && (
            <button
              type="button"
              onClick={props.onOpenMobileCall}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#26472b] px-5 text-sm font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-[#37ca37]/30 md:hidden"
            >
              <Phone className="size-4" aria-hidden="true" />
              Return to call
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="hidden md:block">
          <CallControls {...props} />
        </div>
        <CallFeedback {...props} />
      </div>

      {!inCall && props.callState !== "ended" && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-gray-500">
          <Mic className="size-3.5 shrink-0" aria-hidden="true" />
          Allow microphone access when prompted so Carla can hear you.
        </p>
      )}
    </section>
  );
}