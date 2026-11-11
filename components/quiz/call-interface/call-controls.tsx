"use client";

import { PhoneOff, Mic, MicOff } from "lucide-react";
import type { CallState } from "./types";

interface CallControlsProps {
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  transcript: string;
  onToggleMute: () => void;
  onEndCall: () => void;
  formatTime: (seconds: number) => string;
  variant?: "desktop" | "mobile";
}

export default function CallControls({
  callState, callDuration, isMuted, transcript, onToggleMute, onEndCall, formatTime,
  variant = "desktop",
}: CallControlsProps) {
  if (callState === "idle" || callState === "ended") return null;
  // Recognition is active during connecting and AI playback too, so mute must
  // remain available from the beginning of the call.
  const microphoneAvailable = callState !== "error";

  if (variant === "mobile") {
    return (
      <div className="flex items-start justify-center gap-12">
        <div className="flex w-20 flex-col items-center gap-3">
          <button
            type="button"
            onClick={onToggleMute}
            disabled={!microphoneAvailable}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-pressed={isMuted}
            className={`flex size-[72px] items-center justify-center rounded-full outline-none transition duration-200 enabled:cursor-pointer enabled:active:scale-95 focus-visible:ring-4 focus-visible:ring-white/50 disabled:opacity-35 ${isMuted ? "bg-white text-[#18351f]" : "bg-white/15 text-white enabled:hover:bg-white/25"}`}
          >
            {isMuted ? <MicOff className="size-7" aria-hidden="true" /> : <Mic className="size-7" aria-hidden="true" />}
          </button>
          <span className="text-sm text-white/85">{isMuted ? "Unmute" : "Mute"}</span>
        </div>
        <div className="flex w-20 flex-col items-center gap-3">
          <button
            type="button"
            onClick={onEndCall}
            aria-label={callState === "connecting" ? "Cancel call" : "End call"}
            className="flex size-[72px] cursor-pointer items-center justify-center rounded-full bg-[#ef4444] text-white shadow-lg shadow-red-950/20 outline-none transition duration-200 hover:bg-red-500 active:scale-95 focus-visible:ring-4 focus-visible:ring-white/50"
          >
            <PhoneOff className="size-7" aria-hidden="true" />
          </button>
          <span className="text-sm text-white/85">{callState === "connecting" ? "Cancel" : "End call"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-[#dfeae1] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-[#526957]">
          <span className="size-1.5 rounded-full bg-[#37a34c]" aria-hidden="true" />
          <span className="font-mono tabular-nums" aria-label={`Call duration ${formatTime(callDuration)}`}>
            {formatTime(callDuration)}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {microphoneAvailable && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={isMuted}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-[#37ca37]/25 ${isMuted ? "border-[#26472b] bg-[#26472b] text-white" : "border-[#d5e2d8] bg-white text-[#26472b] hover:bg-[#edf4ef]"}`}
            >
              {isMuted ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
              {isMuted ? "Unmute" : "Mute"}
            </button>
          )}
          <button
            type="button"
            onClick={onEndCall}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-red-50 px-4 text-sm font-semibold text-red-700 outline-none transition hover:bg-red-100 focus-visible:ring-4 focus-visible:ring-red-200"
          >
            <PhoneOff className="size-4" aria-hidden="true" />
            {callState === "connecting" ? "Cancel call" : "End call"}
          </button>
        </div>
      </div>
      {transcript && callState === "listening" && (
        <p className="mt-3 max-h-24 overflow-y-auto rounded-xl bg-white px-4 py-3 text-sm leading-relaxed text-gray-600" aria-live="polite">
          &ldquo;{transcript}&rdquo;
        </p>
      )}
    </div>
  );
}