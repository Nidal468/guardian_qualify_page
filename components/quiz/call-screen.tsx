"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DesktopCallUI, MobileCallUI, useCall } from "./call-interface";
import { useContact } from "./call-interface/use-contact";
import type { CallUIProps } from "./call-interface/types";

interface CallScreenProps {
  name: string;
  phone?: string;
  email?: string;
}

const GHL_WIDGET_ID = process.env.NEXT_PUBLIC_GHL_WIDGET_ID;

export default function CallScreen({ name, phone, email }: CallScreenProps) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const firstName = first || undefined;
  const lastName = rest.join(" ") || undefined;

  const contact = useContact(email);
  const call = useCall({ email, phone, firstName, lastName, ghlContactId: contact.contactId });
  const [mobileCallOpen, setMobileCallOpen] = useState(false);
  const closeMobileCall = useCallback(() => setMobileCallOpen(false), []);
  const openMobileCall = () => setMobileCallOpen(true);
  const startCall = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setMobileCallOpen(true);
    // Keep audio initialization directly in the user's click gesture.
    call.startCall();
  };

  // Keyboard: Enter to start call when idle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON";
      if (event.key === "Enter" && !isInput && call.callState === "idle" && contact.ready) {
        event.preventDefault();
        startCall();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [call.callState, contact.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const props: CallUIProps = {
    callState: call.callState,
    callDuration: call.callDuration,
    transcript: call.transcript,
    isMuted: call.isMuted,
    microphoneReady: call.microphoneReady,
    microphoneWarning: call.microphoneWarning,
    readyToCall: contact.ready,
    lookupPending: contact.loading,
    lookupError: contact.error,
    error: call.error,
    needsAudioPermission: call.needsAudioPermission,
    onStartCall: startCall,
    onEndCall: call.endCall,
    onToggleMute: call.toggleMute,
    onRetryMicrophone: call.retryMicrophone,
    onResumeAudio: call.resumeAudio,
    onRetryLookup: contact.retry,
    onSkipLookup: contact.continueWithoutContact,
    formatTime: call.formatTime,
  };

  return (
    <>
      {GHL_WIDGET_ID && (
        <Script
          src="https://widgets.leadconnectorhq.com/loader.js"
          data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
          data-widget-id={GHL_WIDGET_ID}
          strategy="afterInteractive"
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <DesktopCallUI {...props} onOpenMobileCall={openMobileCall} />
        <MobileCallUI {...props} open={mobileCallOpen} onClose={closeMobileCall} />
      </motion.div>
    </>
  );
}