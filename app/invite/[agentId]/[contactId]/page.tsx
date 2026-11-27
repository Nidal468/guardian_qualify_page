"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QuizHeader from "@/components/quiz/header";
import QuizCard from "@/components/quiz/card";
import CallScreen from "@/components/quiz/call-screen";
import { TOTAL_STEPS } from "@/lib/quiz-data";

interface ContactData {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col font-sans text-[#212529] bg-[#fafafa] min-h-screen w-full">
        <QuizHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#26472b] rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading…</p>
          </div>
        </div>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}

function InviteContent() {
  const params = useParams<{ agentId: string; contactId: string }>();
  const { agentId, contactId } = params;

  const [contact, setContact] = useState<ContactData | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ghl-contact?contactId=${contactId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Contact not found");
        return res.json() as Promise<ContactData>;
      })
      .then(setContact)
      .catch((err) => {
        if (err.name !== "AbortError") setError("We couldn't load your details. Please try refreshing the page.");
      });
    return () => controller.abort();
  }, [contactId]);

  return (
    <div className="flex flex-col font-sans text-[#212529] space-y-4 sm:space-y-6 md:space-y-10 bg-[#fafafa] min-h-screen w-full">
      <QuizHeader />
      <div className="flex-1 flex flex-col items-center justify-start w-full space-y-4 sm:space-y-6 md:space-y-10 bg-[#fafafa]">
        <div className="w-full">
          <section className="lead-steps bg-[#fafafa] p-4">
            <div className="flex flex-col">
              <QuizCard pct={100} isDone currentStep={TOTAL_STEPS} totalSteps={TOTAL_STEPS}>
                {error ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <p className="text-gray-600 text-base">{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-[#26472b] text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-[#1e3a22] transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : contact ? (
                  <CallScreen
                    agentId={agentId}
                    initialContactId={contactId}
                    firstName={contact.firstName}
                    lastName={contact.lastName}
                    phone={contact.phone}
                    email={contact.email}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 space-y-3">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-[#26472b] rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Loading your call…</p>
                  </div>
                )}
              </QuizCard>
            </div>
          </section>
        </div>

        {/* Inline disclaimers */}
        <div className="w-full bg-white py-6 sm:py-8 px-4">
          <div className="max-w-[900px] mx-auto text-center text-gray-500 text-xs leading-relaxed space-y-2">
            <p>&copy; 2026 Home 1st Group Ltd. All rights reserved.</p>
            <p>The home audit and quotation are free, with no obligation to proceed. What we recommend depends on your property, household and priorities.</p>
            <p>Safety technology is designed to help identify potential concerns, such as possible falls or unusual inactivity. No system can guarantee that every event will be detected or prevented, and this is not a medical diagnosis.</p>
            <p>All systems are subject to home audit and site suitability.</p>
            <p>
              <a href="https://guardian1st.io/privacy" target="_blank" rel="noopener noreferrer" className="text-[#26472b] underline hover:no-underline">Privacy Policy</a>
              {" | "}
              <a href="https://guardian1st.io/cookie-policy" target="_blank" rel="noopener noreferrer" className="text-[#26472b] underline hover:no-underline">Cookie Policy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}