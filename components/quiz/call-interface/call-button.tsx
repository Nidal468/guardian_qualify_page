"use client";

import { Loader2, Phone } from "lucide-react";
import type { CallState } from "./types";

interface CallButtonProps {
  callState: CallState;
  readyToCall: boolean;
  onStartCall: () => void;
}

export default function CallButton({ callState, readyToCall, onStartCall }: CallButtonProps) {
  const canStart = readyToCall && ["idle", "ended", "error"].includes(callState);
  const label = !readyToCall ? "Preparing your call…"
    : callState === "connecting" ? "Connecting…"
    : callState === "error" ? "Retry connection"
    : callState === "ended" ? "Call Again"
    : callState === "idle" ? "Talk to Carla now" : "Call in progress";

  return (
    <button
      type="button"
      onClick={onStartCall}
      disabled={!canStart}
      className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2.5 rounded-full bg-[#26472b] px-6 py-3.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(38,71,43,0.18)] outline-none transition duration-200 enabled:cursor-pointer enabled:hover:bg-[#1d3a22] enabled:active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-[#37ca37]/30 disabled:cursor-not-allowed disabled:bg-[#dfe8e1] disabled:text-[#617766] disabled:shadow-none md:w-auto"
    >
      {!readyToCall || callState === "connecting"
        ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        : <Phone className="size-4" aria-hidden="true" />}
      {label}
    </button>
  );
}