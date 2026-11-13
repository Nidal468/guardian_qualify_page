"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  pct: number;
}

export default function ProgressBar({ pct }: ProgressBarProps) {
  return (
    <div className="w-full mb-1.5 px-0">
      <div className="text-[#26472b] text-sm font-bold mb-1.5 flex justify-between items-center">
        <span>Progress</span>
        <span>{pct}%</span>
      </div>
      <div className="relative h-[7px] bg-[#e6ecea] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-green-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}