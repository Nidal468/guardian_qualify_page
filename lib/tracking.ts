/**
 * Meta tracking data capture & persistence utilities.
 *
 * - `captureUrlParams()` stores fbclid + UTM params in sessionStorage on initial load.
 * - `getMetaTrackingData()` reads cookies and returns the full tracking payload
 *   to include in the GHL webhook submission.
 */

const PARAM_KEYS = [
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

/**
 * Parse the current URL and persist tracking params to sessionStorage.
 * Idempotent — safe to call on every mount. Only writes keys that are
 * present in the URL (so refreshes without params don't clobber stored values).
 */
export function captureUrlParams(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of PARAM_KEYS) {
      const value = params.get(key);
      if (value !== null && value !== "") {
        sessionStorage.setItem(key, value);
      }
    }
  } catch {
    // sessionStorage may be unavailable (private browsing, etc.)
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Collect all Meta tracking data needed for the GHL webhook payload.
 * Reads cookies (_fbp, _fbc), falls back to sessionStorage for URL params,
 * and constructs fbc manually if the cookie hasn't been dropped yet.
 */
export function getMetaTrackingData(): {
  fbclid: string;
  fbc: string;
  fbp: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  landing_page_url: string;
} {
  const readParam = (key: ParamKey): string => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(key) || sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  };

  const fbclid = readParam("fbclid");
  const fbp = getCookie("_fbp") || "";
  let fbc = getCookie("_fbc") || "";

  // Fallback: construct fbc if cookie wasn't dropped yet but fbclid exists
  if (!fbc && fbclid) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
  }

  return {
    fbclid,
    fbc,
    fbp,
    utm_source: readParam("utm_source"),
    utm_medium: readParam("utm_medium"),
    utm_campaign: readParam("utm_campaign"),
    utm_content: readParam("utm_content"),
    utm_term: readParam("utm_term"),
    landing_page_url: window.location.href,
  };
}