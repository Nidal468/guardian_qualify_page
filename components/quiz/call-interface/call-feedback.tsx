import { AlertCircle, Loader2, Volume2 } from "lucide-react";
import type { CallUIProps } from "./types";

interface CallFeedbackProps extends CallUIProps {
  variant?: "desktop" | "mobile";
}

export default function CallFeedback({ variant = "desktop", ...props }: CallFeedbackProps) {
  if (!props.lookupPending && !(props.lookupError && !props.readyToCall) && !props.error && !props.microphoneWarning && !props.needsAudioPermission) return null;

  const mobile = variant === "mobile";
  const buttonClass = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-semibold outline-none transition focus-visible:ring-4 ${mobile
    ? "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white/40"
    : "bg-white text-[#26472b] hover:bg-[#edf4ef] focus-visible:ring-[#37ca37]/25"}`;

  return (
    <div className={`mx-auto mt-4 flex max-w-md flex-col items-center gap-3 rounded-xl p-4 text-center text-sm leading-relaxed ${mobile ? "bg-white/10 text-white/90" : "border border-[#dfeae1] bg-white/70 text-gray-600"}`}>
      {props.lookupPending && (
        <p role="status" className="inline-flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          Setting up your contact…
        </p>
      )}
      {props.lookupError && !props.readyToCall && (
        <>
          <p role="alert">{props.lookupError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={props.onRetryLookup} className={buttonClass}>Retry setup</button>
            <button type="button" onClick={props.onSkipLookup} className={buttonClass}>Continue without contact link</button>
          </div>
        </>
      )}
      {props.error && (
        <p role="alert" className="flex items-start gap-2 text-left">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {props.error}
        </p>
      )}
      {props.microphoneWarning && !props.isMuted && (
        <>
          <p role="status" className="flex items-start gap-2 text-left">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {props.microphoneWarning}
          </p>
          <button type="button" onClick={props.onRetryMicrophone} className={buttonClass}>
            Retry voice input
          </button>
        </>
      )}
      {props.needsAudioPermission && (
        <>
          <p>One more tap to hear Carla.</p>
          <button type="button" onClick={props.onResumeAudio} className={`${buttonClass} gap-2`}>
            <Volume2 className="size-4" aria-hidden="true" />
            Enable audio playback
          </button>
        </>
      )}
    </div>
  );
}