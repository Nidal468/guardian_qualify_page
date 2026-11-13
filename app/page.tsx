"use client";

import QuizHeader from "@/components/quiz/header";
import QuizHeading from "@/components/quiz/heading";
import QuizCard from "@/components/quiz/card";
import QuizQuestion from "@/components/quiz/question";
import LeadForm from "@/components/quiz/lead-form";
import ThankYou from "@/components/quiz/thank-you";
import CallScreen from "@/components/quiz/call-screen";
import QuizFooter from "@/components/quiz/footer";
import { STEPS, TOTAL_STEPS } from "@/lib/quiz-data";
import { useQuizState } from "@/lib/use-quiz-state";

// Option-based steps have their key in `answers`; form steps validate their own fields (null).
const STEP_KEYS: (string | null)[] = STEPS.map((s) => (s.isInput ? null : s.key));

export default function Home() {
  const quiz = useQuizState(TOTAL_STEPS, STEP_KEYS);
  const currentStep = STEPS[quiz.idx];
  const submitted = quiz.submitted;

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-background">
      <QuizHeader />
      <div className="w-full max-w-285 min-h-screen mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* Only show heading on first step */}
        {quiz.idx === 0 && !submitted && <QuizHeading />}
        <QuizCard
          pct={submitted ? 100 : currentStep.pct}
          isDone={submitted}
          currentStep={submitted ? TOTAL_STEPS : quiz.idx + 1}
          totalSteps={TOTAL_STEPS}
        >
          {submitted && quiz.lead ? (
            quiz.showCallScreen ? (
              <CallScreen name={quiz.lead.name} phone={quiz.lead.phone} email={quiz.lead.email} />
            ) : (
              <ThankYou
                name={quiz.lead.name}
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
      <QuizFooter />
    </main>
  );
}