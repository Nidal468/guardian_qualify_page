"use client";

import { motion } from "framer-motion";
import { ClipboardCheck, EyeOff, Layers } from "lucide-react";

const BENEFITS = [
  {
    icon: ClipboardCheck,
    title: "No Upfront Pressure",
    body: "Start with a free home audit. We'll design the right protection around your home and your family — with a free, personalised, no-obligation quotation.",
  },
  {
    icon: EyeOff,
    title: "Discreet Protection, No Pendants",
    body: "Room-based safety technology designed to blend into your home — supporting independence and dignity without making it feel like a care facility.",
  },
  {
    icon: Layers,
    title: "With Or Without Either Service",
    body: "Start with home security, personal safety, or both. Add the other later if your needs change. Our audits are free and you're under no obligation.",
  },
];

export default function Benefits() {
  return (
    <section aria-label="Why choose Guardian 1st" className="w-full max-w-4xl mx-auto px-3 sm:px-4 pt-10 sm:pt-12 pb-4">
      <motion.h2
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.4 }}
        className="text-center text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6"
      >
        Why homeowners choose Guardian 1st
      </motion.h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BENEFITS.map((benefit, index) => (
          <motion.article
            key={benefit.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            className="group relative bg-white rounded-2xl border border-brand-100/70 shadow-[0_2px_12px_rgba(20,53,31,0.05)] p-6 transition-shadow hover:shadow-[0_8px_32px_rgba(20,53,31,0.10)] overflow-hidden"
          >
            {/* Subtle gradient accent on hover */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-400 to-brand-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              aria-hidden="true"
            />
            <span
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100/60 text-brand-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
              aria-hidden="true"
            >
              <benefit.icon className="w-6 h-6" strokeWidth={2} />
            </span>
            <h3 className="mt-4 text-brand-900 font-bold text-base sm:text-[17px] leading-snug">{benefit.title}</h3>
            <p className="mt-2 text-gray-500 text-sm sm:text-[15px] leading-relaxed">{benefit.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}