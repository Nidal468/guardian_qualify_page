import Link from "next/link";

export default function QuizHeader() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-[1140px] mx-auto px-4 flex items-center justify-between py-2">
        <div className="flex items-center">
          <Link href="/" aria-label="Guardian 1st">
            <img src="/logo.png" alt="Guardian 1st" className="h-[46px] w-auto" />
          </Link>
        </div>
        <div className="text-[#26472b] font-bold text-sm hidden md:block">
          <b>Free, No-Obligation Home Audits</b>
        </div>
      </div>
    </header>
  );
}