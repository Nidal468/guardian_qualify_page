export type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export interface CallUIProps {
  callState: CallState;
  callDuration: number;
  transcript: string;
  isMuted: boolean;
  microphoneReady: boolean;
  microphoneWarning: string;
  readyToCall: boolean;
  lookupPending: boolean;
  lookupError: string;
  error: string;
  needsAudioPermission: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onRetryMicrophone: () => void;
  onResumeAudio: () => void;
  onRetryLookup: () => void;
  onSkipLookup: () => void;
  formatTime: (seconds: number) => string;
}