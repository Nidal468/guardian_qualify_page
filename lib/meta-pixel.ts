/**
 * Meta Pixel event tracking utilities.
 *
 * The base pixel (fbevents.js) is loaded in app/layout.tsx via next/script.
 * This module provides a safe wrapper to fire custom events from client components.
 */

type FbqFunction = (...args: unknown[]) => void;

function getFbq(): FbqFunction | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { fbq?: FbqFunction }).fbq;
}

/**
 * Fire a Meta Pixel event.
 * @param eventName - e.g. "ViewContent", "Lead", "CustomEvent"
 * @param payload - optional event data (content_id, content_name, value, currency, etc.)
 */
export function trackMetaEvent(eventName: string, payload?: Record<string, unknown>): void {
  const fbq = getFbq();
  if (!fbq) return;
  if (payload) {
    fbq("track", eventName, payload);
  } else {
    fbq("track", eventName);
  }
}