"use client";

import { useCallback, useEffect, useState } from "react";

interface ContactState {
  email?: string;
  status: "loading" | "ready" | "error";
  contactId: string | null;
  error: string;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Contact setup is independent of the optional third-party widget loader. */
export function useContact(email?: string) {
  const [state, setState] = useState<ContactState>({ status: "loading", contactId: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      if (skip || !email) {
        setState({ email, status: "ready", contactId: null, error: "" });
        return;
      }
      setState({ email, status: "loading", contactId: null, error: "" });
      try {
        for (let retry = 0; retry < 5; retry++) {
          controller.signal.throwIfAborted();
          const response = await fetch("/api/ghl-lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          });
          if (response.ok) {
            const data = await response.json() as { contactId?: unknown };
            if (typeof data.contactId !== "string" || !data.contactId) throw new Error("Invalid contact response");
            if (!controller.signal.aborted) setState({ email, status: "ready", contactId: data.contactId, error: "" });
            return;
          }
          if (![404, 429, 502, 503].includes(response.status) || retry === 4) break;
          await delay(Math.min(1_000 * 2 ** retry, 5_000), controller.signal);
        }
        throw new Error("Contact setup could not finish");
      } catch {
        if (!controller.signal.aborted) {
          setState({
            email, status: "error", contactId: null,
            error: "Your contact is not ready yet. Retry setup or talk without linking your contact.",
          });
        }
      }
    })();
    return () => controller.abort();
  }, [email, attempt, skip]);

  const retry = useCallback(() => {
    setSkip(false);
    setAttempt((value) => value + 1);
  }, []);
  const continueWithoutContact = useCallback(() => setSkip(true), []);

  const current = state.email === email;
  return {
    contactId: current ? state.contactId : null,
    ready: current && state.status === "ready",
    loading: !current || state.status === "loading",
    error: current ? state.error : "",
    retry,
    continueWithoutContact,
  };
}