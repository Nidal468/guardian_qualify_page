"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSSE, type UserDetails } from "@/lib/call/protocol";
import { callDebugEnabled, callErrorDetails, logCallDiagnostic, type CallDebugDetails } from "@/lib/call/diagnostics";
import { AudioQueue } from "./audio-queue";
import { DecodedAudioQueue } from "./decoded-audio-queue";
import { Microphone } from "./microphone";
import type { CallState } from "./types";

interface UseCallProps extends UserDetails {
  ghlContactId?: string | null;
}

interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;
// Metadata only, never transcripts, audio, session tokens or user details.
function logCall(event: string, details: CallDebugDetails = {}) {
  logCallDiagnostic("browser", event, details);
}

// JSON-formatted logger for debugging - outputs copy-pasteable JSON
function logCallJSON(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    type: "call-debug",
    event,
    ...details,
    at: new Date().toISOString(),
  }));
}

function recognitionConstructor(): RecognitionConstructor | undefined {
  const browser = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

function notifyEnd(sessionId: string) {
  return fetch("/api/call", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
    keepalive: true,
    signal: AbortSignal.timeout(8_000),
  });
}

export function useCall({ email, phone, firstName, lastName, ghlContactId }: UseCallProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const [needsAudioPermission, setNeedsAudioPermission] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [microphoneWarning, setMicrophoneWarning] = useState("");

  const stateRef = useRef<CallState>("idle");
  const mutedRef = useRef(false);
  const generationRef = useRef(0);
  const sessionRef = useRef<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const messageControllerRef = useRef<AbortController | null>(null);
  const playerRef = useRef<AudioQueue | DecodedAudioQueue | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  // Recognition capture readiness gates transcripts; UI readiness belongs to
  // the persistent microphone stream, not this browser-controlled session.
  const microphoneReadyRef = useRef(false);
  const microphoneRef = useRef<Microphone | null>(null);
  const noSpeechCountRef = useRef(0);
  const inputEpochRef = useRef(0);
  // Utterances outlive individual browser recognition sessions.
  const pendingSpeechRef = useRef("");
  const carriedSpeechRef = useRef("");
  const resetSpeechRef = useRef<(() => void) | null>(null);
  const startRecognitionRef = useRef<(() => void) | null>(null);
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const turnCompleteRef = useRef(false);
  const readyRef = useRef(false);
  const sendingRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastAudioStartRef = useRef(0);
  // Server-generated diagnostic ID, NOT the call's bearer session ID.
  const requestIdRef = useRef<string | null>(null);

  const transition = useCallback((state: CallState) => {
    logCall("state.transition", {
      from: stateRef.current, to: state, muted: mutedRef.current,
      microphoneReady: microphoneReadyRef.current, inputEpoch: inputEpochRef.current,
    });
    if (state !== stateRef.current) {
      noSpeechCountRef.current = 0;
      setMicrophoneWarning("");
    }
    stateRef.current = state;
    setCallState(state);
  }, []);

  const clearPendingSpeech = useCallback(() => {
    logCall("speech.pending.clear", {
      state: stateRef.current, previousEpoch: inputEpochRef.current,
      nextEpoch: inputEpochRef.current + 1, canceledDebounce: speechTimerRef.current !== null,
    });
    inputEpochRef.current++;
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
    pendingSpeechRef.current = "";
    carriedSpeechRef.current = "";
    resetSpeechRef.current?.();
    setTranscript("");
  }, []);

  const stopRecognition = useCallback(() => {
    logCall("recognition.stop", {
      state: stateRef.current, muted: mutedRef.current,
      hadRecognizer: recognitionRef.current !== null, canceledRestart: restartTimerRef.current !== null,
    });
    clearPendingSpeech();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    resetSpeechRef.current = null;
    microphoneReadyRef.current = false;
    if (recognition) {
      recognition.onstart = null;
      recognition.onsoundstart = null;
      recognition.onsoundend = null;
      recognition.onspeechend = null;
      recognition.onaudiostart = null;
      recognition.onaudioend = null;
      recognition.onspeechstart = null;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch (abortError) {
        logCall("recognition.abort.error", callErrorDetails(abortError));
      }
    }
  }, [clearPendingSpeech]);

  const stopMicrophone = useCallback(() => {
    microphoneRef.current?.stop();
    microphoneRef.current = null;
    setMicrophoneReady(false);
    setMicrophoneWarning("");
    noSpeechCountRef.current = 0;
  }, []);

  const stopResources = useCallback((reason = "reset") => {
    logCall("resources.stop", {
      reason, requestId: requestIdRef.current,
      state: stateRef.current, previousGeneration: generationRef.current,
      nextGeneration: generationRef.current + 1,
    });
    // JSON log for easy copy-paste debugging
    logCallJSON("resources.stop", {
      reason,
      sessionId: sessionRef.current,
      conversationId: conversationRef.current,
      state: stateRef.current,
      playerBusy: playerRef.current?.busy ?? false,
      queueDepth: playerRef.current?.queueDepth ?? 0,
      generation: generationRef.current,
    });
    generationRef.current++;
    stopRecognition();
    stopMicrophone();
    controllerRef.current?.abort();
    controllerRef.current = null;
    messageControllerRef.current?.abort();
    messageControllerRef.current = null;
    playerRef.current?.clear();
    playerRef.current = null;
    readyRef.current = false;
    turnCompleteRef.current = false;
    turnRef.current = null;
    sendingRef.current = false;
  }, [stopMicrophone, stopRecognition]);

  const fail = useCallback((message: string, generation: number) => {
    logCall("call.failure", {
      state: stateRef.current, generation, currentGeneration: generationRef.current,
      requestId: requestIdRef.current, stale: generation !== generationRef.current,
    });
    // JSON log for easy copy-paste debugging
    logCallJSON("call.failure", {
      message,
      sessionId: sessionRef.current,
      conversationId: conversationRef.current,
      state: stateRef.current,
      generation,
      currentGeneration: generationRef.current,
      playerBusy: playerRef.current?.busy ?? false,
    });
    if (generation !== generationRef.current) return;
    stopResources("failure");
    setError(message);
    setNeedsAudioPermission(false);
    transition("error");
  }, [stopResources, transition]);

  const startMicrophone = useCallback(() => {
    if (microphoneRef.current || mutedRef.current || ["idle", "ended", "error"].includes(stateRef.current)) return;
    if (!controllerRef.current || controllerRef.current.signal.aborted) return;
    const generation = generationRef.current;
    const microphone = new Microphone({
      onReady: () => {
        if (generation !== generationRef.current || microphoneRef.current !== microphone) return;
        logCall("microphone.capture.ready", { generation });
        setMicrophoneReady(true);
      },
      onError: (captureError) => {
        const name = captureError instanceof Error ? captureError.name : "unknown";
        logCall("microphone.capture.error", { generation, ...callErrorDetails(captureError) });
        const message = name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access in your browser, then retry."
          : name === "NotFoundError"
            ? "No microphone was found. Connect a microphone and retry."
            : name === "NotReadableError"
              ? "Your microphone could not be opened. Check system permissions or close other apps using it, then retry."
              : "Unable to open your microphone. Check browser permissions and use HTTPS, then retry.";
        if (microphoneRef.current === microphone) {
          // Don't fail the entire call - set a warning and let the user retry
          logCall("microphone.capture.warning", { generation, errorCode: name, message });
          setMicrophoneWarning(message);
          microphoneRef.current = null;
          setMicrophoneReady(false);
        }
      },
      onEnded: () => {
        if (microphoneRef.current === microphone) {
          // Don't fail the call - just set a warning and let user retry
          logCall("microphone.track.ended", { generation });
          logCallJSON("microphone.track.ended", {
            sessionId: sessionRef.current,
            conversationId: conversationRef.current,
            state: stateRef.current,
            generation,
          });
          microphoneRef.current = null;
          setMicrophoneReady(false);
          setMicrophoneWarning("Microphone disconnected. Click 'Retry Microphone' to continue.");
          // Keep the call alive - user can retry the microphone
        }
      },
      shouldMeasure: () => stateRef.current === "listening" && !mutedRef.current,
    });
    microphoneRef.current = microphone;
    void microphone.start();
  }, [fail]);

  const maybeListen = useCallback(() => {
    logCall("listening.gate", {
      state: stateRef.current, hasController: controllerRef.current !== null,
      aborted: controllerRef.current?.signal.aborted,
      serverReady: readyRef.current, turnComplete: turnCompleteRef.current,
      audioBusy: playerRef.current?.busy ?? false, microphoneReady: microphoneReadyRef.current,
      hasRecognizer: recognitionRef.current !== null,
    });
    if (controllerRef.current?.signal.aborted || !controllerRef.current) return;
    if (readyRef.current && turnCompleteRef.current && !playerRef.current?.busy) {
      if (stateRef.current !== "listening") clearPendingSpeech();
      transition("listening");
      // Ensure a live recognizer exists now that we're listening.
      // The onend restart may not have fired yet, or may have silently failed.
      if (!mutedRef.current && !recognitionRef.current) {
        logCall("listening.ensure.recognition", { reason: "no-active-recognizer" });
        startRecognitionRef.current?.();
      }
    }
  }, [clearPendingSpeech, transition]);

  const sendMessage = useCallback(async (message: string) => {
    // Defensive check: never send empty or whitespace-only messages
    if (!message || !message.trim()) {
      logCall("message.submit.skipped.empty", { textLength: message?.length ?? 0 });
      return;
    }
    const sessionId = sessionRef.current;
    const conversationId = conversationRef.current;
    if (!sessionId || !conversationId || sendingRef.current || stateRef.current !== "listening") {
      logCall("message.submit.skipped", {
        hasSession: Boolean(sessionId), hasConversation: Boolean(conversationId),
        alreadySending: sendingRef.current, state: stateRef.current, textLength: message.length,
      });
      return;
    }
    logCall("message.submit", { state: stateRef.current, textLength: message.length });
    const generation = generationRef.current;
    const messageId = crypto.randomUUID();
    sendingRef.current = true;
    turnRef.current = messageId;
    turnCompleteRef.current = false;
    // Keep the recognition service warm; close only the input acceptance gate.
    clearPendingSpeech();
    transition("thinking");
    setTranscript("");
    setError("");
    const controller = new AbortController();
    messageControllerRef.current = controller;

    try {
      // Retry only storage/acknowledgement, with the SAME idempotency key.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const requestStartedAt = Date.now();
          logCall("message.request", {
            attempt: attempt + 1, textLength: message.length, turnId: messageId,
            streamRequestId: requestIdRef.current,
          });
          const response = await fetch("/api/call/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, conversationId, messageId, message }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          });
          logCall("message.response", {
            attempt: attempt + 1, httpStatus: response.status, ok: response.ok,
            elapsedMs: Date.now() - requestStartedAt, turnId: messageId,
            requestId: response.headers.get("X-Call-Request-Id"),
          });
          if (!response.ok) {
            if (response.status >= 500 && attempt === 0) continue;
            throw new Error("Unable to save your message. Retry the connection before speaking again.");
          }
          const data = await response.json() as { status?: string };
          logCall("message.acknowledged", { failed: data.status === "failed", aborted: controller.signal.aborted });
          if (data.status === "failed") throw new Error("That message was interrupted. Please reconnect.");
          return;
        } catch (requestError) {
          logCall("message.request.error", {
            attempt: attempt + 1, aborted: controller.signal.aborted,
            turnId: messageId, ...callErrorDetails(requestError),
          });
          if (controller.signal.aborted || attempt === 1) throw requestError;
        }
      }
    } catch (messageError) {
      logCall("message.failed", {
        turnId: messageId, requestId: requestIdRef.current,
        aborted: controller.signal.aborted, ...callErrorDetails(messageError),
      });
      if (!controller.signal.aborted) fail("Unable to confirm your message. Retry the connection.", generation);
    } finally {
      if (generation === generationRef.current) {
        sendingRef.current = false;
        messageControllerRef.current = null;
      }
    }
  }, [clearPendingSpeech, fail, transition]);

  const scheduleSpeechSubmission = useCallback(() => {
    if (!pendingSpeechRef.current || mutedRef.current || stateRef.current !== "listening") return;
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    const epoch = inputEpochRef.current;
    const generation = generationRef.current;
    logCall("speech.debounce.scheduled", {
      delayMs: 1_200, scheduledEpoch: epoch, textLength: pendingSpeechRef.current.length,
    });
    const timer = setTimeout(() => {
      // A replaced/canceled callback must not clear or submit a newer utterance.
      if (speechTimerRef.current !== timer) return;
      speechTimerRef.current = null;
      const eligible = generation === generationRef.current && epoch === inputEpochRef.current
        && !mutedRef.current && stateRef.current === "listening"
        && Boolean(controllerRef.current) && !controllerRef.current?.signal.aborted;
      logCall("speech.debounce.fired", {
        scheduledEpoch: epoch, acceptanceGateOpen: eligible,
        epochMatches: epoch === inputEpochRef.current, textLength: pendingSpeechRef.current.length,
      });
      // Interim text is useful input too. Do not wait indefinitely for isFinal.
      // Gate by call/utterance, NOT recognizer identity, so restarts cannot lose it.
      if (eligible && pendingSpeechRef.current) void sendMessage(pendingSpeechRef.current);
    }, 1_200);
    speechTimerRef.current = timer;
  }, [sendMessage]);

  const startRecognition = useCallback(function beginRecognition(): void {
    logCall("recognition.start.requested", {
      state: stateRef.current, muted: mutedRef.current,
      hasRecognizer: recognitionRef.current !== null, hasController: controllerRef.current !== null,
      aborted: controllerRef.current?.signal.aborted,
    });
    if (mutedRef.current || ["idle", "ended", "error"].includes(stateRef.current) || recognitionRef.current) {
      logCall("recognition.start.skipped", {
        reason: mutedRef.current ? "muted" : recognitionRef.current ? "already-running" : "inactive-call",
      });
      return;
    }
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      logCall("recognition.start.skipped", { reason: "missing-or-aborted-controller" });
      return;
    }
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    const Constructor = recognitionConstructor();
    const generation = generationRef.current;
    if (!Constructor) {
      fail("Voice input is not supported in this browser. Please use Chrome or Edge.", generation);
      return;
    }
    const recognition = new Constructor();
    const finals = new Map<number, string>();
    const interims = new Map<number, string>();
    // Final results are stable within a continuous session, but interim slots
    // can be replaced or removed. Never permanently blacklist an interim index.
    const observedResults = new Map<number, { epoch: number; isFinal: boolean }>();
    const current = () => generation === generationRef.current && recognitionRef.current === recognition;
    const acceptsSpeech = () => current() && !mutedRef.current && stateRef.current === "listening";
    const recognitionStartedAt = Date.now();
    const logRecognition = (event: string, details: CallDebugDetails = {}) => logCall(event, {
      generation, currentGeneration: generationRef.current, currentRecognizer: current(),
      state: stateRef.current, muted: mutedRef.current, microphoneReady: microphoneReadyRef.current,
      inputEpoch: inputEpochRef.current, elapsedMs: Date.now() - recognitionStartedAt, ...details,
    });
    resetSpeechRef.current = () => {
      finals.clear();
      interims.clear();
    };
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.onstart = () => logRecognition("recognition.started");
    recognition.onsoundstart = () => logRecognition("recognition.sound.start");
    recognition.onsoundend = () => logRecognition("recognition.sound.end");
    recognition.onspeechend = () => {
      logRecognition("recognition.speech.end");
      if (acceptsSpeech()) scheduleSpeechSubmission();
    };
    recognition.onaudiostart = () => {
      logRecognition("recognition.audio.start");
      if (!current()) return;
      microphoneReadyRef.current = true;
      lastAudioStartRef.current = Date.now();
    };
    recognition.onaudioend = () => {
      logRecognition("recognition.audio.end");
      if (!current()) return;
      // Don't clear microphoneReadyRef here - let onend handle full cleanup.
      // The browser may still deliver final results after audioend fires.
      // Clearing it here causes subsequent results to be ignored with
      // "microphone-not-ready" reason, breaking voice recognition.
    };
    recognition.onspeechstart = () => {
      logRecognition("recognition.speech.start", {
        acceptanceGateOpen: acceptsSpeech(), cancelingDebounce: speechTimerRef.current !== null,
      });
      // Extend the pause window, never cancel it without a replacement.
      // Some browsers emit speechstart but never follow it with a final result.
      if (acceptsSpeech()) scheduleSpeechSubmission();
    };
    recognition.onresult = (event) => {
      logRecognition("recognition.result.received", {
        resultIndex: event.resultIndex, resultCount: event.results.length,
        acceptanceGateOpen: acceptsSpeech(),
      });
      if (!current()) {
        logRecognition("recognition.result.ignored", { reason: "stale-recognizer" });
        return;
      }
      const epoch = inputEpochRef.current;
      let changed = false;
      // The browser may withdraw an interim slot and reuse that index later.
      for (const [index, observed] of observedResults) {
        if (index >= event.results.length && !observed.isFinal) {
          logRecognition("recognition.interim.withdrawn", { index, observedEpoch: observed.epoch });
          observedResults.delete(index);
          interims.delete(index);
        }
      }
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const observed = observedResults.get(index);
        const resultDetails = {
          index, isFinal: result.isFinal, textLength: result[0].transcript.length,
          observedEpoch: observed?.epoch, observedWasFinal: observed?.isFinal,
        };
        // Do not replay finalized results from playback or an earlier user turn.
        if (observed?.isFinal && observed.epoch !== epoch) {
          logRecognition("recognition.result.ignored", { ...resultDetails, reason: "final-from-another-epoch" });
          continue;
        }
        const eligible = acceptsSpeech() && (microphoneReadyRef.current || observed?.epoch === epoch);
        if (!eligible) {
          logRecognition("recognition.result.ignored", {
            ...resultDetails,
            reason: mutedRef.current ? "muted" : stateRef.current !== "listening" ? "not-listening" : "microphone-not-ready",
          });
          observedResults.set(index, { epoch: -1, isFinal: result.isFinal });
          continue;
        }
        // A final for an interim last observed during playback is still stale.
        // A NEW interim, however, is allowed to replace that mutable slot.
        if (result.isFinal && observed && observed.epoch !== epoch) {
          logRecognition("recognition.result.ignored", { ...resultDetails, reason: "interim-from-another-epoch" });
          observedResults.set(index, { epoch: -1, isFinal: true });
          continue;
        }
        logRecognition("recognition.result.accepted", resultDetails);
        observedResults.set(index, { epoch, isFinal: result.isFinal });
        changed = true;
        if (result.isFinal) {
          finals.set(index, result[0].transcript.trim());
          interims.delete(index);
        } else {
          interims.set(index, result[0].transcript.trim());
        }
      }
      if (!changed) {
        logRecognition("recognition.result.no-accepted-changes");
        return;
      }
      const sessionText = [...finals, ...interims]
        .sort(([left], [right]) => left - right)
        .map(([, text]) => text).filter(Boolean).join(" ").trim();
      const text = [carriedSpeechRef.current, sessionText].filter(Boolean).join(" ");
      logRecognition("transcript.updated", {
        finalTextLength: [...finals.values()].join(" ").length,
        interimTextLength: [...interims.values()].join(" ").length, finalResultCount: finals.size,
      });
      noSpeechCountRef.current = 0;
      setMicrophoneWarning("");
      if (!text) return;
      const textChanged = text !== pendingSpeechRef.current;
      pendingSpeechRef.current = text;
      setTranscript(text);
      // Start for interim AND final text. Repeated identical results/finalization
      // must not keep pushing the same words' deadline further into the future.
      if (textChanged || !speechTimerRef.current) scheduleSpeechSubmission();
    };
    recognition.onerror = (event) => {
      logRecognition("recognition.error", {
        errorCode: event.error, nonfatal: event.error === "aborted" || event.error === "no-speech",
      });
      if (!current()) return;
      if (event.error === "no-speech") {
        // Silence is normal, but repeated silent failures need useful feedback.
        // Count only user turns, never the greeting or AI playback timeouts.
        if (stateRef.current === "listening" && !mutedRef.current) {
          noSpeechCountRef.current++;
          if (noSpeechCountRef.current >= 2) {
            const heardInput = microphoneRef.current?.heardRecently ?? false;
            logRecognition("recognition.no-speech.repeated", {
              count: noSpeechCountRef.current, captureHeardInput: heardInput,
            });
            setMicrophoneWarning(heardInput
              ? "Microphone input is detected, but browser speech recognition is not returning words. Check the browser's default microphone or try Chrome/Edge, then retry voice input."
              : "No speech is being detected. If you are speaking, check the browser's selected microphone, system input volume and hardware mute, then retry voice input.");
          }
        }
        return;
      }
      if (event.error === "aborted") return;
      // Don't fail the entire call for recognition errors - set a warning instead.
      // This allows the user to retry the microphone without losing the call session.
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow microphone access, then retry."
        : "Voice input stopped working. Check your microphone and retry.";
      logRecognition("recognition.error.warning", { errorCode: event.error, message });
      setMicrophoneWarning(message);
      // Stop recognition but keep the call session alive
      recognitionRef.current = null;
      microphoneReadyRef.current = false;
    };
    recognition.onend = () => {
      logRecognition("recognition.ended", { finalResultCount: finals.size });
      if (!current()) return;
      if (acceptsSpeech()) {
        carriedSpeechRef.current = pendingSpeechRef.current;
        // Preserve the existing 1.2s deadline, even while no recognizer is live.
        if (pendingSpeechRef.current && !speechTimerRef.current) scheduleSpeechSubmission();
      }
      recognitionRef.current = null;
      resetSpeechRef.current = null;
      microphoneReadyRef.current = false;
      // Browsers can end even a continuous session. Restart during AI turns
      // too, so any unavoidable warm-up happens before the user needs to speak.
      if (!mutedRef.current && !["idle", "ended", "error"].includes(stateRef.current)) {
        // Avoid a tight restart loop if a browser immediately aborts a session.
        const delayMs = Date.now() - recognitionStartedAt < 1_000 ? 1_000 : 100;
        logRecognition("recognition.restart.scheduled", { delayMs });
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          logRecognition("recognition.restart.fired", { generationMatches: generation === generationRef.current });
          if (generation === generationRef.current) beginRecognition();
        }, delayMs);
      }
    };
    recognitionRef.current = recognition;
    startRecognitionRef.current = beginRecognition;
    logRecognition("recognition.start.call", {
      continuous: recognition.continuous, interimResults: recognition.interimResults, language: recognition.lang,
      secureContext: window.isSecureContext,
      visibility: typeof document === "undefined" ? "unknown" : document.visibilityState,
    });
    try {
      recognition.start();
      logRecognition("recognition.start.returned");
    } catch (startError) {
      logRecognition("recognition.start.threw", callErrorDetails(startError));
      fail("Unable to start your microphone. Check browser permissions and retry.", generation);
    }
  }, [fail, scheduleSpeechSubmission]);

  const startCall = useCallback(() => {
    const callStartAt = Date.now();
    console.log(`[Call perf] call.start`, { state: stateRef.current });
    logCall("call.start.requested", { state: stateRef.current, recognitionSupported: Boolean(recognitionConstructor()) });
    if (!["idle", "ended", "error"].includes(stateRef.current)) return;
    if (!recognitionConstructor()) {
      setError("Voice input is not supported in this browser. Please use Chrome or Edge.");
      transition("error");
      return;
    }
    const resuming = stateRef.current === "error" && Boolean(sessionRef.current);
    if (!resuming) {
      sessionRef.current = null;
      conversationRef.current = null;
      startedAtRef.current = Date.now();
      setCallDuration(0);
    }
    stopResources(resuming ? "retry-connection" : "new-call");
    requestIdRef.current = null;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    mutedRef.current = false;
    setIsMuted(false);
    setError("");
    setTranscript("");
    setNeedsAudioPermission(false);
    transition("connecting");
    let firstAudioReceivedAt: number | undefined;
    let firstPlaybackAt: number | undefined;

    // Default to complete-clip decoding. The old engine is an explicit build-time
    // opt-out for device comparisons, never a silent fallback after decode errors.
    const Player = process.env.NEXT_PUBLIC_CALL_AUDIO_PLAYER === "html" ? AudioQueue : DecodedAudioQueue;
    playerRef.current = new Player({
      diagnosticContext: () => ({ requestId: requestIdRef.current, generation }),
      onPlaying: () => {
        if (firstPlaybackAt === undefined && firstAudioReceivedAt !== undefined) {
          firstPlaybackAt = Date.now();
          console.log(`[Call perf] first.playback.started`, {
            sinceCallStartMs: firstPlaybackAt - callStartAt,
            audioToPlaybackMs: firstPlaybackAt - firstAudioReceivedAt,
          });
        }
        logCall("playback.started", { state: stateRef.current, generation, currentGeneration: generationRef.current });
        if (generation !== generationRef.current) return;
        clearPendingSpeech();
        transition("speaking");
      },
      onDrain: () => {
        logCall("playback.drained", { state: stateRef.current, generation, currentGeneration: generationRef.current });
        if (generation === generationRef.current) maybeListen();
      },
      onBlocked: () => {
        logCall("playback.blocked", { state: stateRef.current, generation, currentGeneration: generationRef.current });
        if (generation === generationRef.current) setNeedsAudioPermission(true);
      },
      onResumed: () => {
        if (generation === generationRef.current) setNeedsAudioPermission(false);
      },
      onError: (reason) => {
        const message = reason === "decode"
          ? "Carla's audio could not be decoded. Retry the call or try another browser."
          : reason === "unsupported"
            ? "Audio output is not supported in this browser. Open this page in an updated browser."
            : reason === "initialization"
              ? "Unable to initialize audio output. Retry the call or try another browser."
              : "Audio playback failed. Retry the connection.";
        fail(message, generation);
      },
    });
    // Create, prime and resume output before any await loses the Start gesture.
    playerRef.current.initialize();
    if (controller.signal.aborted || generation !== generationRef.current) return;
    // Request persistent capture and recognition in the initial click gesture.
    // Recognition may time out; capture remains open independently.
    startMicrophone();
    startRecognition();

    void (async () => {
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let streamStage = "request";
      let lastEventAt = Date.now();
      let lastAudioAt: number | undefined;
      let lastAudioTurn: string | undefined;
      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          logCall("stream.watchdog.expired", {
            requestId: requestIdRef.current, stage: streamStage,
            sinceLastEventMs: Date.now() - lastEventAt, state: stateRef.current,
          });
          fail("The call stopped responding. Retry the connection.", generation);
        }, 150_000);
      };
      try {
        let resumeSession = resuming;
        let unexpectedDrops = 0;
        const MAX_UNEXPECTED_RETRIES = 3;
        while (!controller.signal.aborted && generation === generationRef.current) {
          resetWatchdog();
          let response: Response | undefined;
          for (let attempt = 0; attempt < 4; attempt++) {
            const requestStartedAt = Date.now();
            streamStage = "request";
            logCall("stream.request", {
              attempt: attempt + 1, resuming: resumeSession, state: stateRef.current, generation,
            });
            response = await fetch("/api/call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resumeSession ? { sessionId: sessionRef.current } : {
                message: `Please greet the user by name: ${firstName || "our valued guest"}. You are Carla from Guardian 1st.`,
                contactId: ghlContactId || undefined,
                contactName: `${firstName || ""} ${lastName || ""}`.trim(),
                userDetails: { email, phone, firstName, lastName },
              }),
              signal: controller.signal,
            });
            requestIdRef.current = response.headers.get("X-Call-Request-Id");
            console.log(`[Call perf] stream.response.received`, { sinceCallStartMs: Date.now() - callStartAt, attempt: attempt + 1, status: response.status });
            logCall("stream.response", {
              httpStatus: response.status, ok: response.ok, resuming: resumeSession,
              elapsedMs: Date.now() - requestStartedAt, requestId: requestIdRef.current, generation,
            });
            if (response.status !== 409 || !resumeSession || attempt === 3) break;
            await response.body?.cancel();
            await new Promise<void>((resolve, reject) => {
              const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
              const timer = setTimeout(() => {
                controller.signal.removeEventListener("abort", abort);
                resolve();
              }, 500 * (attempt + 1));
              controller.signal.addEventListener("abort", abort, { once: true });
              if (controller.signal.aborted) abort();
            });
          }
          if (!response) throw new Error("Unable to connect to Carla.");
          if (!response.ok || !response.body) {
            if (response.status === 410) { sessionRef.current = null; conversationRef.current = null; }
            const data = await response.json().catch(() => ({})) as { error?: string };
            throw new Error(data.error || "Unable to connect to Carla.");
          }
          let reconnect = false;
          streamStage = "read-events";
          for await (const event of readSSE(response.body, controller.signal)) {
            if (generation !== generationRef.current) return;
            const sinceLastEventMs = Date.now() - lastEventAt;
            lastEventAt = Date.now();
            resetWatchdog();
            streamStage = "parse-event";
            const data = JSON.parse(event.data) as Record<string, unknown>;
            streamStage = "handle-event";
            logCall("stream.event", {
              requestId: requestIdRef.current, sinceLastEventMs,
              event: event.event, state: stateRef.current, processing: data.type === "processing",
              turnId: typeof data.turnId === "string" ? data.turnId : undefined,
              turnMatches: typeof data.turnId === "string" ? data.turnId === turnRef.current : undefined,
              sequence: typeof data.sequence === "number" ? data.sequence : undefined,
            });
            switch (event.event) {
              case "session":
                if (typeof data.sessionId !== "string") throw new Error("Invalid call session");
                sessionRef.current = data.sessionId;
                if (typeof data.conversationId === "string") conversationRef.current = data.conversationId;
                break;
              case "status":
                if (data.type === "processing" && typeof data.turnId === "string") {
                  turnRef.current = data.turnId;
                  turnCompleteRef.current = false;
                  sequenceRef.current = 0;
                  // Don't clear pending speech here - the user may already be
                  // speaking their next message. Clearing it causes a race
                  // condition where recognized speech is lost.
                  if (!playerRef.current?.busy) transition("thinking");
                }
                break;
              case "audio":
                if (data.turnId !== turnRef.current || data.sequence !== sequenceRef.current || typeof data.audio !== "string") {
                  logCall("stream.audio.invalid-order", {
                    requestId: requestIdRef.current,
                    expectedTurnId: turnRef.current, expectedSequence: sequenceRef.current,
                    receivedSequence: typeof data.sequence === "number" ? data.sequence : undefined,
                    turnMatches: data.turnId === turnRef.current, hasAudio: typeof data.audio === "string",
                  });
                  throw new Error("Audio arrived out of order. Retry the connection.");
                }
                if (firstAudioReceivedAt === undefined) {
                  firstAudioReceivedAt = Date.now();
                  console.log(`[Call perf] first.audio.received`, { sinceCallStartMs: firstAudioReceivedAt - callStartAt });
                }
                logCall("stream.audio.received", {
                  requestId: requestIdRef.current, turnId: turnRef.current, sequence: sequenceRef.current,
                  base64Chars: data.audio.length, playerBusy: playerRef.current?.busy ?? false,
                  sincePreviousAudioMs: lastAudioAt === undefined ? undefined : Date.now() - lastAudioAt,
                  sameTurnAsPreviousAudio: lastAudioTurn === turnRef.current,
                });
                lastAudioAt = Date.now();
                lastAudioTurn = turnRef.current ?? undefined;
                sequenceRef.current++;
                playerRef.current?.enqueue({
                  audio: data.audio, format: typeof data.format === "string" ? data.format : "mp3",
                  turnId: turnRef.current ?? undefined, sequence: data.sequence as number,
                });
                break;
              case "turn-complete":
                if (data.turnId === turnRef.current) {
                  turnCompleteRef.current = true;
                  maybeListen();
                }
                break;
              case "ready":
                readyRef.current = true;
                // A resumed session may have no greeting to replay.
                if (!turnRef.current) turnCompleteRef.current = true;
                maybeListen();
                break;
              case "error":
                logCall("stream.server.error", {
                  requestId: requestIdRef.current, fatal: data.fatal === true, restart: data.restart === true,
                  turnMatches: data.turnId === turnRef.current,
                });
                if (data.restart === true) { sessionRef.current = null; conversationRef.current = null; }
                if (data.fatal === true) throw new Error(typeof data.message === "string" ? data.message : "Call failed");
                setError(typeof data.message === "string" ? data.message : "Carla could not answer that message.");
                break;
              case "ended":
                stopResources("server-ended");
                sessionRef.current = null;
                conversationRef.current = null;
                setNeedsAudioPermission(false);
                transition("ended");
                return;
              case "reconnect":
                if (!sessionRef.current) throw new Error("Missing call session during reconnection.");
                reconnect = true;
                // Keep the SAME player, call generation, mute state and duration.
                // Buffered clips can finish while the next stream drains its backlog.
                readyRef.current = false;
                if (turnCompleteRef.current || data.interrupted === true) {
                  turnRef.current = null;
                  turnCompleteRef.current = false;
                }
                // Queue writes do not need a live SSE owner. Keep an existing
                // listener/utterance alive during handoff rather than losing speech.
                if (stateRef.current !== "listening") {
                  clearPendingSpeech();
                  if (!playerRef.current?.busy) transition("connecting");
                }
                if (data.interrupted === true) {
                  setError("The previous answer was interrupted. Please ask again after reconnection.");
                }
                break;
            }
            streamStage = "read-events";
          }
          logCall("stream.eof", {
            requestId: requestIdRef.current, plannedReconnect: reconnect,
            state: stateRef.current, sinceLastEventMs: Date.now() - lastEventAt,
          });
          if (reconnect) {
            // Server-planned rotation: reconnect immediately, no backoff needed.
            unexpectedDrops = 0;
            resumeSession = true;
            continue;
          }
          // Unexpected stream drop: attempt auto-reconnect with backoff.
          unexpectedDrops++;
          if (unexpectedDrops > MAX_UNEXPECTED_RETRIES || !sessionRef.current) {
            logCall("stream.reconnect.exhausted", {
              drop: unexpectedDrops, maxRetries: MAX_UNEXPECTED_RETRIES,
              sessionId: sessionRef.current, conversationId: conversationRef.current,
              state: stateRef.current, playerBusy: playerRef.current?.busy ?? false,
              queuedClips: playerRef.current?.queueDepth ?? 0,
            });
            throw new Error("The call disconnected. Retry the connection to continue.");
          }
          logCall("stream.unexpected.drop", {
            drop: unexpectedDrops, maxRetries: MAX_UNEXPECTED_RETRIES,
            state: stateRef.current, hasSession: Boolean(sessionRef.current),
            sessionId: sessionRef.current, conversationId: conversationRef.current,
            playerBusy: playerRef.current?.busy ?? false,
            queuedClips: playerRef.current?.queueDepth ?? 0,
            currentTurnId: turnRef.current,
          });
          setError("Connection lost. Reconnecting…");
          clearPendingSpeech();
          // Log that audio continues playing during reconnection (seamless experience)
          if (playerRef.current?.busy) {
            logCall("stream.reconnect.audio-continues", {
              drop: unexpectedDrops, conversationId: conversationRef.current,
              sessionId: sessionRef.current, playerBusy: true,
              queuedClips: playerRef.current?.queueDepth ?? 0,
            });
          }
          if (!playerRef.current?.busy) transition("connecting");
          readyRef.current = false;
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = 1000 * Math.pow(2, unexpectedDrops - 1);
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
            const timer = setTimeout(() => {
              controller.signal.removeEventListener("abort", abort);
              resolve();
            }, delayMs);
            controller.signal.addEventListener("abort", abort, { once: true });
            if (controller.signal.aborted) abort();
          });
          if (controller.signal.aborted) return;
          logCall("stream.reconnect.attempt", {
            drop: unexpectedDrops, conversationId: conversationRef.current,
            sessionId: sessionRef.current, delayMs,
          });
          resumeSession = true;
        }
      } catch (connectionError) {
        logCall("stream.error", {
          state: stateRef.current, aborted: controller.signal.aborted,
          stale: generation !== generationRef.current,
          requestId: requestIdRef.current, stage: streamStage,
          sinceLastEventMs: Date.now() - lastEventAt, ...callErrorDetails(connectionError),
        });
        // JSON log for easy copy-paste debugging
        logCallJSON("stream.error", {
          error: connectionError instanceof Error ? connectionError.message : String(connectionError),
          errorName: connectionError instanceof Error ? connectionError.name : "Unknown",
          sessionId: sessionRef.current,
          conversationId: conversationRef.current,
          state: stateRef.current,
          stage: streamStage,
          aborted: controller.signal.aborted,
          playerBusy: playerRef.current?.busy ?? false,
          queueDepth: playerRef.current?.queueDepth ?? 0,
        });
        if (!controller.signal.aborted && generation === generationRef.current) {
          fail(connectionError instanceof Error ? connectionError.message : "Unable to connect to Carla.", generation);
        }
      } finally {
        clearTimeout(watchdog);
      }
    })();
  }, [email, phone, firstName, lastName, ghlContactId, clearPendingSpeech, fail, maybeListen, startMicrophone, startRecognition, stopResources, transition]);

  const endCall = useCallback(() => {
    logCall("call.end.requested", { state: stateRef.current });
    const sessionId = sessionRef.current;
    stopResources("user-hang-up");
    sessionRef.current = null;
    conversationRef.current = null;
    setNeedsAudioPermission(false);
    setTranscript("");
    setError("");
    transition("ended");
    if (sessionId) {
      void notifyEnd(sessionId).then((response) => {
        logCall("hangup.response", {
          httpStatus: response.status, requestId: response.headers.get("X-Call-Request-Id"),
        });
      }).catch((hangupError) => {
        logCall("hangup.error", callErrorDetails(hangupError));
      });
    }
  }, [stopResources, transition]);

  const toggleMute = useCallback(() => {
    logCall("microphone.mute.toggled", {
      state: stateRef.current, wasMuted: mutedRef.current, willBeMuted: !mutedRef.current,
    });
    mutedRef.current = !mutedRef.current;
    setIsMuted(mutedRef.current);
    if (mutedRef.current) {
      stopRecognition();
      stopMicrophone();
    } else {
      startMicrophone();
      startRecognition();
    }
  }, [startMicrophone, startRecognition, stopMicrophone, stopRecognition]);

  const retryMicrophone = useCallback(() => {
    if (mutedRef.current || ["idle", "ended", "error"].includes(stateRef.current)) return;
    stopRecognition();
    stopMicrophone();
    startMicrophone();
    startRecognition();
  }, [startMicrophone, startRecognition, stopMicrophone, stopRecognition]);

  const resumeAudio = useCallback(() => {
    logCall("playback.resume.requested", { requestId: requestIdRef.current, state: stateRef.current });
    // Keep the button available until output actually resumes, including when
    // a mobile browser leaves resume() pending until another user gesture.
    playerRef.current?.resume();
  }, []);

  // Recognition lifecycle is driven by call/mute/browser events, not React
  // state transitions. Unmount cleanup is owned by stopResources below.
  const active = !["idle", "ended", "error"].includes(callState);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  // Recognition watchdog: if we're in "listening" but the browser's
  // SpeechRecognition silently died (no audiostart in >6s), force-restart it.
  useEffect(() => {
    if (!active) return;
    const watchdog = setInterval(() => {
      const listening = stateRef.current === "listening" && !mutedRef.current;
      if (!listening || !controllerRef.current || controllerRef.current.signal.aborted) return;
      const hasRecognizer = recognitionRef.current !== null;
      const staleAudioStart = Date.now() - lastAudioStartRef.current > 6_000;
      if (!hasRecognizer || (staleAudioStart && !microphoneReadyRef.current)) {
        logCall("recognition.watchdog.restart", {
          hasRecognizer, staleAudioStart, microphoneReady: microphoneReadyRef.current,
          sinceLastAudioStartMs: Date.now() - lastAudioStartRef.current,
        });
        stopRecognition();
        startRecognition();
      }
    }, 5_000);
    return () => clearInterval(watchdog);
  }, [active, startRecognition, stopRecognition]);

   // Auto-resume AudioContext when the tab regains focus.
   // Browsers suspend AudioContext after ~5s in background, silently killing all output.
   useEffect(() => {
     if (!active || typeof document === "undefined") return;
     const onVisibilityChange = () => {
       if (document.visibilityState === "visible") {
         logCall("audio.auto-resume.on-visibility", {
           state: stateRef.current, playerExists: playerRef.current !== null,
         });
         playerRef.current?.resume();
       }
     };
     document.addEventListener("visibilitychange", onVisibilityChange);
     return () => {
       document.removeEventListener("visibilitychange", onVisibilityChange);
     };
   }, [active]);

   useEffect(() => {
    if (!active || !callDebugEnabled("browser") || typeof document === "undefined") return;
    const logVisibility = () => logCall("page.visibility", {
      requestId: requestIdRef.current, visibility: document.visibilityState,
      state: stateRef.current, microphoneReady: microphoneReadyRef.current,
      playerBusy: playerRef.current?.busy ?? false,
      online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    });
    const logNetwork = () => logCall("page.network", {
      requestId: requestIdRef.current, online: navigator.onLine, state: stateRef.current,
    });
    logVisibility();
    document.addEventListener("visibilitychange", logVisibility);
    window.addEventListener("online", logNetwork);
    window.addEventListener("offline", logNetwork);
    return () => {
      document.removeEventListener("visibilitychange", logVisibility);
      window.removeEventListener("online", logNetwork);
      window.removeEventListener("offline", logNetwork);
    };
  }, [active]);

  useEffect(() => () => {
    const sessionId = sessionRef.current;
    stopResources("unmount");
    if (sessionId) void notifyEnd(sessionId).catch((hangupError) => {
      logCall("hangup.unmount.error", callErrorDetails(hangupError));
    });
  }, [stopResources]);

  return {
    callState, callDuration, transcript, isMuted, microphoneReady, microphoneWarning, error, needsAudioPermission,
    startCall, endCall, toggleMute, retryMicrophone, resumeAudio,
    formatTime: (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`,
  };
}