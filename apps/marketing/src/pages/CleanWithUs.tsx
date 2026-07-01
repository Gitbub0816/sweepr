import { useState } from "react";
import { useTranslation } from "react-i18next";
import { withLang } from "../i18n/languages";
import { MarketingShell, Button, SweeprLogo } from "@sweepr/ui";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  Wallet,
  CalendarClock,
  GraduationCap,
  MapPin,
  Star,
  ArrowRight,
  Building2,
  UserRound,
  HeartHandshake,
  BadgeCheck,
  Clock,
  TrendingUp,
} from "lucide-react";
import { CoverageMapSection } from "../components/CoverageMapSection";

const CLEANER_URL =
  (import.meta.env.VITE_CLEANER_URL || "https://clean.getsweepr.com") + "/sign-up";

const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };
const stagger = { show: { transition: { staggerChildren: 0.1 } } };

const navLinks = [
  { label: "How it works", href: "#how" },
  { label: "Why Sweepr", href: "#why" },
  { label: "Coverage", href: "#coverage" },
  { label: "For Customers", href: "/" },
];

type Tab = "individual" | "business";

// ── Tab content ──────────────────────────────────────────────────────────────

interface Step {
  icon: React.ElementType;
  title: string;
  body: string;
}

const INDIVIDUAL_STEPS: Step[] = [
  {
    icon: UserRound,
    title: "Create your Sweepr profile",
    body: "Tell us about yourself, your service area, and the kinds of cleans you love. It takes minutes and you can pick up right where you left off.",
  },
  {
    icon: GraduationCap,
    title: "Complete the Sweepr Academy",
    body: "Short, practical training modules get you ready to deliver a consistent, five-star clean. Finish them at your own pace from your dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Get verified",
    body: "A background check and identity verification keep the whole community safe. Your documents go straight to our verification partners — never stored by Sweepr.",
  },
  {
    icon: CalendarClock,
    title: "Set your availability",
    body: "You decide when you work and how far you'll travel. Jobs that match your schedule and skills show up on your board.",
  },
  {
    icon: Wallet,
    title: "Get paid",
    body: "Accept the jobs you want, do great work, and get paid directly to your bank. Track every payout from your dashboard.",
  },
];

const BUSINESS_STEPS: Step[] = [
  {
    icon: Building2,
    title: "Register your business",
    body: "Bring your existing cleaning company onto Sweepr. Add your legal details and the team members who clean under your name.",
  },
  {
    icon: BadgeCheck,
    title: "Verify your business",
    body: "We confirm your business details and insurance so customers know they're booking a trusted, established operation.",
  },
  {
    icon: GraduationCap,
    title: "Onboard your Sweeprs",
    body: "Each cleaner on your team completes the Sweepr Academy and verification, so every job meets the same high standard.",
  },
  {
    icon: TrendingUp,
    title: "Grow your book of business",
    body: "Fill the gaps in your schedule with matched jobs in your service area — no marketing budget required.",
  },
  {
    icon: Wallet,
    title: "Manage payouts in one place",
    body: "Payouts flow to your business account with clear records for every completed job across your team.",
  },
];

const INDIVIDUAL_PERKS = [
  { icon: Clock, title: "Work on your terms", body: "Pick your hours, your area, and the jobs that fit your life." },
  { icon: HeartHandshake, title: "Be more than a cleaner", body: "On Sweepr you're a Sweepr — a trusted pro customers ask for by name." },
  { icon: Star, title: "Build your reputation", body: "Ratings and reviews follow you and unlock higher tiers and better jobs." },
  { icon: ShieldCheck, title: "Coverage that has your back", body: "Optional group liability coverage is available so you can work with peace of mind." },
];

const BUSINESS_PERKS = [
  { icon: TrendingUp, title: "Steady demand", body: "Tap into matched bookings to keep your crew busy and your calendar full." },
  { icon: BadgeCheck, title: "Trusted badge", body: "Verified-business status helps you stand out and win more work." },
  { icon: Wallet, title: "Simple payouts", body: "Consolidated, transparent payments for your whole team." },
  { icon: HeartHandshake, title: "Your Sweeprs, elevated", body: "Give your cleaners the Sweepr name, training, and support customers love." },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
    >
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <motion.div
            key={s.title}
            variants={fadeUp}
            className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="absolute right-5 top-5 text-5xl font-black text-slate-100 dark:text-slate-800">
              {i + 1}
            </span>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-seafoam-500 text-white shadow-lg shadow-seafoam-500/30">
              <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-charcoal dark:text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {s.body}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function PerkGrid({ perks }: { perks: { icon: React.ElementType; title: string; body: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {perks.map((p) => {
        const Icon = p.icon;
        return (
          <div
            key={p.title}
            className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-seafoam-900/20">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-charcoal dark:text-white">{p.title}</h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab switcher ───────────────────────────────────────────────────────────────

function TabSwitch({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "individual", label: "I'm an Individual Cleaner", icon: UserRound },
    { id: "business", label: "I have a Cleaning Business", icon: Building2 },
  ];
  return (
    <div className="mx-auto flex w-full max-w-xl gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={active}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors"
          >
            {active && (
              <motion.span
                layoutId="cleanTabHighlight"
                className="absolute inset-0 rounded-xl bg-seafoam-500 shadow"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span
              className={`relative z-10 flex items-center gap-2 ${
                active ? "text-white" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CleanWithUs() {
  const [tab, setTab] = useState<Tab>("individual");
  const { i18n } = useTranslation();
  const cleanerUrl = withLang(CLEANER_URL, i18n.language);

  const steps = tab === "individual" ? INDIVIDUAL_STEPS : BUSINESS_STEPS;
  const perks = tab === "individual" ? INDIVIDUAL_PERKS : BUSINESS_PERKS;

  return (
    <MarketingShell
      navLinks={navLinks}
      cta={
        <a href={cleanerUrl}>
          <Button>Become a Sweepr</Button>
        </a>
      }
    >
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-seafoam-700 shadow-sm dark:bg-slate-900 dark:text-seafoam-300">
              <Sparkles className="h-3.5 w-3.5" /> Join the Sweepr community
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black tracking-tight text-charcoal dark:text-white sm:text-5xl">
              See how Sweepr is a fit for you
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500 dark:text-slate-400">
              On Sweepr, cleaners aren't just cleaners — they're{" "}
              <span className="font-semibold text-seafoam-600">Sweeprs</span>: trusted,
              trained pros that customers book by name. Choose your path to get started.
            </p>
          </motion.div>

          <div className="mt-10">
            <TabSwitch tab={tab} setTab={setTab} />
          </div>
        </div>
      </section>

      {/* Animated tab content */}
      <div className="mx-auto max-w-6xl px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === "individual" ? -32 : 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === "individual" ? 32 : -32 }}
            transition={{ duration: 0.3 }}
          >
            {/* How it works */}
            <section id="how" className="py-16">
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-black text-charcoal dark:text-white">
                  {tab === "individual"
                    ? "How it works for individual Sweeprs"
                    : "How it works for cleaning businesses"}
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
                  {tab === "individual"
                    ? "From sign-up to your first payout — here's the whole journey."
                    : "Bring your team onto Sweepr and keep your calendar full."}
                </p>
              </div>
              <StepList steps={steps} />
            </section>

            {/* Why Sweepr */}
            <section id="why" className="py-16">
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-black text-charcoal dark:text-white">
                  {tab === "individual" ? "Why Sweeprs love Sweepr" : "Why businesses choose Sweepr"}
                </h2>
              </div>
              <PerkGrid perks={perks} />
            </section>
          </motion.div>
        </AnimatePresence>

        {/* The "Sweepr" difference — shared */}
        <section className="py-16">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-seafoam-500 to-seafoam-600 px-6 py-14 text-center text-white sm:px-12">
            <SweeprLogo size="lg" className="mx-auto mb-6 brightness-0 invert" />
            <h2 className="mx-auto max-w-2xl text-3xl font-black">
              We don't have cleaners. We have Sweeprs.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-seafoam-50">
              The name is a promise: trained, verified, and trusted. Every Sweepr is matched
              to jobs on a best-fit basis — by location, availability, skills, and ratings — so
              great work gets recognized and rewarded.
            </p>
          </div>
        </section>
      </div>

      {/* Coverage map */}
      <section id="coverage" className="bg-white py-4 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 pt-12 text-center">
          <h2 className="text-3xl font-black text-charcoal dark:text-white">
            Where Sweeprs are working
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            <MapPin className="mr-1 inline h-4 w-4 text-seafoam-600" />
            We're growing fast. See where Sweepr is live and what's coming next.
          </p>
        </div>
        <CoverageMapSection />
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-3xl font-black text-charcoal dark:text-white sm:text-4xl">
          Ready to become a Sweepr?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
          Create your profile today and start your journey. You can complete each step at your
          own pace from your dashboard.
        </p>
        <a href={cleanerUrl} className="mt-8 inline-block">
          <Button size="lg">
            Get started <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </a>
      </section>
    </MarketingShell>
  );
}
