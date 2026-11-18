"use client";

import QuizHeader from "@/components/quiz/header";
import QuizHeading from "@/components/quiz/heading";
import QuizCard from "@/components/quiz/card";
import QuizQuestion from "@/components/quiz/question";
import LeadForm from "@/components/quiz/lead-form";
import ThankYou from "@/components/quiz/thank-you";
import CallScreen from "@/components/quiz/call-screen";
import PeaceOfMind from "@/components/quiz/peace-of-mind";
import { STEPS, TOTAL_STEPS } from "@/lib/quiz-data";
import { useQuizState } from "@/lib/use-quiz-state";

// Option-based steps have their key in `answers`; form steps validate their own fields (null).
const STEP_KEYS: (string | null)[] = STEPS.map((s) => (s.isInput ? null : s.key));

export default function Home() {
  const quiz = useQuizState(TOTAL_STEPS, STEP_KEYS);
  const currentStep = STEPS[quiz.idx];
  const submitted = quiz.submitted;

  return (
    <div className="flex flex-col font-sans text-[#212529] space-y-4 sm:space-y-6 md:space-y-10 bg-[#fafafa] min-h-screen w-full">
      <QuizHeader />
      <div className="flex-1 flex flex-col items-center justify-between w-full space-y-4 sm:space-y-6 md:space-y-10 bg-[#fafafa]">
        <div className="w-full">
          {quiz.idx === 0 && !submitted && <QuizHeading />}
          <section className="lead-steps bg-[#fafafa] p-4" id="contactForm">
            <div className="flex flex-col">
              <QuizCard
                pct={submitted ? 100 : currentStep.pct}
                isDone={submitted}
                currentStep={submitted ? TOTAL_STEPS : quiz.idx + 1}
                totalSteps={TOTAL_STEPS}
              >
                {submitted && quiz.lead ? (
                  quiz.showCallScreen ? (
                    <CallScreen firstName={quiz.lead.firstName} lastName={quiz.lead.lastName} phone={quiz.lead.phone} email={quiz.lead.email} />
                  ) : (
                    <ThankYou
                      firstName={quiz.lead.firstName}
                      lastName={quiz.lead.lastName}
                      phone={quiz.lead.phone}
                      email={quiz.lead.email}
                      onProceedToCall={quiz.goToCallScreen}
                    />
                  )
                ) : currentStep.isInput ? (
                  <LeadForm
                    currentStep={currentStep}
                    idx={quiz.idx}
                    answers={quiz.answers}
                    formFields={quiz.formFields}
                    updateFormFields={quiz.updateFormFields}
                    onGoPrev={quiz.goPrev}
                    onGoNext={quiz.goNext}
                    onSubmitted={(lead) => quiz.completeLead(lead)}
                  />
                ) : (
                  <QuizQuestion
                    currentStep={currentStep}
                    idx={quiz.idx}
                    answers={quiz.answers}
                    onSelectOption={quiz.selectOption}
                    onGoPrev={quiz.goPrev}
                  />
                )}
              </QuizCard>
            </div>
          </section>
          {quiz.idx === 0 && !submitted && <PeaceOfMind />}
        </div>

        {/* Inline disclaimers (old design style) */}
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