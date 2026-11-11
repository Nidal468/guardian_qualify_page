"use client";

import QuizHeader from "@/components/quiz/header";
import QuizHeading from "@/components/quiz/heading";
import QuizCard from "@/components/quiz/card";
import QuizQuestion from "@/components/quiz/question";
import LeadForm from "@/components/quiz/lead-form";
import QuizDone from "@/components/quiz/done-screen";
import Benefits from "@/components/quiz/benefits";
import QuizFooter from "@/components/quiz/footer";
import { STEPS, TOTAL_STEPS } from "@/lib/quiz-data";
import { useQuizState } from "@/lib/use-quiz-state";

export default function Home() {
  const quiz = useQuizState(TOTAL_STEPS);
  const currentStep = STEPS[quiz.idx];
  const submitted = quiz.submitted;

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-background">
      <QuizHeader />
      <div className="flex-1 w-full max-w-[1140px] mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <QuizHeading />
        <QuizCard
          pct={submitted ? 100 : currentStep.pct}
          isDone={submitted}
          currentStep={submitted ? TOTAL_STEPS : quiz.idx + 1}
          totalSteps={TOTAL_STEPS}
        >
          {submitted && quiz.lead ? (
            <QuizDone name={quiz.lead.name} phone={quiz.lead.phone} email={quiz.lead.email} />
          ) : currentStep.isInput ? (
            <LeadForm
              currentStep={currentStep}
              idx={quiz.idx}
              answers={quiz.answers}
              onGoPrev={quiz.goPrev}
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
        <Benefits />
      </div>
      <QuizFooter />
    </main>
  );
}