import {
  Check,
  Clock,
  Handshake,
  HelpCircle,
  History,
  Home,
  Hourglass,
  Lock,
  Radio,
  ShieldCheck,
  ShieldAlert,
  Users,
  Watch,
  Wrench,
} from "lucide-react";

export interface StepOption {
  value: string;
  icon: React.ReactNode;
}

export interface StepData {
  step: string;
  key: string;
  title: string;
  subtitle?: string;
  pct: number;
  options?: StepOption[];
  isStacked?: boolean;
  isInput?: boolean;
}

const icon = (Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>) => (
  <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.4} />
);

export const STEPS: StepData[] = [
  {
    step: "1",
    key: "first_time",
    title: "Is this your first time looking into home protection?",
    subtitle: "It only takes about a minute!",
    pct: 11,
    options: [
      { value: "Yes, this is my first time", icon: icon(Check) },
      { value: "No, I've looked into it before", icon: icon(History) },
    ],
  },
  {
    step: "2",
    key: "protection_for",
    title: "Who is the protection for?",
    pct: 22,
    options: [
      { value: "Myself and my own home", icon: icon(Home) },
      { value: "A parent or older relative", icon: icon(Handshake) },
      { value: "Our family home", icon: icon(Users) },
    ],
  },
  {
    step: "3",
    key: "priority",
    title: "What matters most right now?",
    pct: 33,
    options: [
      { value: "Protecting my property from break-ins", icon: icon(ShieldAlert) },
      { value: "Feeling safer living independently", icon: icon(ShieldCheck) },
      { value: "Reassuring the family", icon: icon(Users) },
      { value: "Not sure yet", icon: icon(HelpCircle) },
    ],
  },
  {
    step: "4",
    key: "alarm",
    title: "Do you currently have a burglar alarm?",
    pct: 44,
    options: [
      { value: "Yes, professionally installed", icon: icon(ShieldCheck) },
      { value: "Yes, a DIY system", icon: icon(Wrench) },
      { value: "No", icon: icon(History) },
      { value: "Not sure", icon: icon(HelpCircle) },
    ],
  },
  {
    step: "5",
    key: "alone_time",
    title: "Does the person living in the property spend time alone?",
    pct: 56,
    options: [
      { value: "Yes, most of the time", icon: icon(Clock) },
      { value: "Some of the time", icon: icon(Hourglass) },
      { value: "No", icon: icon(Users) },
      { value: "Prefer not to say", icon: icon(Lock) },
    ],
  },
  {
    step: "6",
    key: "fall_worry",
    title: "Have you worried about a fall, or a moment when help was needed and no one knew?",
    pct: 67,
    options: [
      { value: "Yes", icon: icon(ShieldAlert) },
      { value: "No", icon: icon(ShieldCheck) },
      { value: "Prefer not to say", icon: icon(Lock) },
    ],
  },
  {
    step: "7",
    key: "discreet",
    title: "Would you prefer protection without wearing a pendant or wrist alarm?",
    pct: 78,
    options: [
      { value: "Yes, I'd prefer discreet technology", icon: icon(Home) },
      { value: "A pendant would be fine", icon: icon(Watch) },
      { value: "Not sure", icon: icon(HelpCircle) },
    ],
  },
  {
    step: "8",
    key: "contact_preference",
    title: "If something happened, who would you want contacted?",
    pct: 89,
    options: [
      { value: "Family members", icon: icon(Users) },
      { value: "Neighbours or trusted friends", icon: icon(Handshake) },
      { value: "Professional monitoring, if available", icon: icon(Radio) },
      { value: "Not sure", icon: icon(HelpCircle) },
    ],
  },
  {
    step: "9",
    key: "lead_form",
    title: "Where should we send your free home assessment recommendation?",
    pct: 100,
    isInput: true,
  },
];

export const TOTAL_STEPS = STEPS.length;
