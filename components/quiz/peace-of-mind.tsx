"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Home, ShieldCheck, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Feel More Confident in Your Own Home",
    body: "Guardian 1st brings together home security and personal safety in one thoughtfully designed system, helping you feel more comfortable and confident in your everyday life.",
  },
  {
    icon: Home,
    title: "Designed Around You",
    body: "Whether you live alone or with someone else, your home and your needs are unique. Guardian 1st is designed to help you feel secure while maintaining your independence.",
  },
  {
    icon: Sparkles,
    title: "Take the First Step — With No Obligation",
    body: "Answer a few simple questions to see whether Guardian 1st could be right for your home. If it looks suitable, you can arrange a free home audit and find out more. There's no pressure and no obligation to buy.",
  },
];

export default function PeaceOfMind() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const scrollToQuiz = () => {
    const quizSection = document.getElementById("contactForm");
    if (quizSection) {
      quizSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Peace of mind"
      className="w-full max-w-4xl mx-auto px-3 sm:px-4 pb-6 sm:pb-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-6"
      >
        <h3 className="text-[#26472b] text-lg sm:text-xl md:text-2xl font-bold leading-snug">
          A Little More Peace of Mind Starts at Home
        </h3>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {FEATURES.map((feature, index) => (
          <motion.article
            key={feature.title}
            initial={{ opacity: 0, y: 24 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl border border-brand-100/70 shadow-[0_2px_12px_rgba(20,53,31,0.05)] p-5 sm:p-6"
          >
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/60 text-brand-600 flex items-center justify-center">
              <feature.icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
            </span>
            <h4 className="mt-3 text-brand-900 font-bold text-sm sm:text-base leading-snug">
              {feature.title}
            </h4>
            <p className="mt-2 text-gray-500 text-xs sm:text-sm leading-relaxed">
              {feature.body}
            </p>
          </motion.article>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={isVisible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="text-center"
      >
        <button
          type="button"
          onClick={scrollToQuiz}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm sm:text-base px-6 py-3 shadow-[0_4px_16px_rgba(46,122,69,0.3)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 cursor-pointer"
        >
          See If Guardian 1st Is Right for You
          <span className="text-brand-200 font-normal text-sm">↓</span>
        </button>
      </motion.div>
    </section>
  );
}