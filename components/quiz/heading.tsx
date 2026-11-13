import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function QuizHeading() {
  return (
    <section className="pt-3 sm:pt-5 pb-3 sm:pb-4 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        {/* Badge */}
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs sm:text-sm font-semibold mb-4"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Takes about 60 seconds
        </motion.span>

        <h1 className="text-brand-900 text-[22px] sm:text-[34px] md:text-[40px] leading-[1.15] font-extrabold tracking-tight max-w-180 mx-auto">
          Free Home Protection{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-500">
            Assessment
          </span>
        </h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mt-3 text-gray-500 text-[13px] sm:text-lg leading-relaxed max-w-135 mx-auto"
        >
          Answer a few quick questions and we&apos;ll recommend the right protection for your home — free, with no obligation.
        </motion.p>
      </motion.div>
    </section>
  );
}