import { ShieldCheck } from "lucide-react";

export default function QuizFooter() {
  return (
    <footer className="bg-gradient-to-b from-brand-900 to-[#0d2214] text-white mt-6">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-brand-300" aria-hidden="true" />
            </span>
            <p className="font-bold text-lg tracking-tight">Guardian 1st</p>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-2">
            <a
              href="https://guardian1st.io/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-200/80 text-[13px] sm:text-sm font-medium hover:text-white px-4 py-2 rounded-full hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/50"
            >
              Privacy Policy
            </a>
            <a
              href="https://guardian1st.io/cookie-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-200/80 text-[13px] sm:text-sm font-medium hover:text-white px-4 py-2 rounded-full hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/50"
            >
              Cookie Policy
            </a>
          </nav>
        </div>

        <p className="mt-4 text-brand-300/70 text-xs sm:text-[13px]">© 2026 Home 1st Group Ltd. All rights reserved.</p>

        <div className="hidden sm:block sm:mt-6 sm:space-y-3 sm:border-t sm:border-white/10 sm:pt-6">
          <p className="text-brand-200/60 text-xs leading-relaxed max-w-2xl">
            The home audit and quotation are free, with no obligation to proceed. What we recommend depends on your property, household and priorities.
          </p>
          <p className="text-brand-200/60 text-xs leading-relaxed max-w-2xl">
            Safety technology is designed to help identify potential concerns, such as possible falls or unusual inactivity. No system can guarantee that every event will be detected or prevented, and this is not a medical diagnosis.
          </p>
          <p className="text-brand-200/60 text-xs leading-relaxed max-w-2xl">
            All systems are subject to home audit and site suitability.
          </p>
        </div>
      </div>
    </footer>
  );
}