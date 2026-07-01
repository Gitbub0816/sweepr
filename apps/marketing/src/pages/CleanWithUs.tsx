import { useState } from "react";
import { useTranslation } from "react-i18next";
import { withLang } from "../i18n/languages";
import { LanguageSelector } from "../i18n/LanguageSelector";
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


type Tab = "individual" | "business";

// ── Tab content ──────────────────────────────────────────────────────────────

interface StepItem {
  icon: React.ElementType;
  /** i18n key prefix under cleanWithUs (e.g. "ind1" -> ind1Title / ind1Body). */
  key: string;
}

const INDIVIDUAL_STEPS = [
  { icon: UserRound, key: "ind1" },
  { icon: GraduationCap, key: "ind2" },
  { icon: ShieldCheck, key: "ind3" },
  { icon: CalendarClock, key: "ind4" },
  { icon: Wallet, key: "ind5" },
] as const;

const BUSINESS_STEPS = [
  { icon: Building2, key: "biz1" },
  { icon: BadgeCheck, key: "biz2" },
  { icon: GraduationCap, key: "biz3" },
  { icon: TrendingUp, key: "biz4" },
  { icon: Wallet, key: "biz5" },
] as const;

const INDIVIDUAL_PERKS = [
  { icon: Clock, key: "perkInd1" },
  { icon: HeartHandshake, key: "perkInd2" },
  { icon: Star, key: "perkInd3" },
  { icon: ShieldCheck, key: "perkInd4" },
] as const;

const BUSINESS_PERKS = [
  { icon: TrendingUp, key: "perkBiz1" },
  { icon: BadgeCheck, key: "perkBiz2" },
  { icon: Wallet, key: "perkBiz3" },
  { icon: HeartHandshake, key: "perkBiz4" },
] as const;

function StepList({ steps }: { steps: readonly StepItem[] }) {
  const { t } = useTranslation();
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
            key={s.key}
            variants={fadeUp}
            className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="absolute right-5 top-5 text-5xl font-black text-slate-100 dark:text-slate-800">
              {i + 1}
            </span>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-seafoam-500 text-white shadow-lg shadow-seafoam-500/30">
              <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-charcoal dark:text-white">{t(`cleanWithUs.${s.key}Title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {t(`cleanWithUs.${s.key}Body`)}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function PerkGrid({ perks }: { perks: readonly StepItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {perks.map((p) => {
        const Icon = p.icon;
        return (
          <div
            key={p.key}
            className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-seafoam-900/20">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-charcoal dark:text-white">{t(`cleanWithUs.${p.key}Title`)}</h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(`cleanWithUs.${p.key}Body`)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab switcher ───────────────────────────────────────────────────────────────

function TabSwitch({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "individual", label: t("cleanWithUs.tabIndividual"), icon: UserRound },
    { id: "business", label: t("cleanWithUs.tabBusiness"), icon: Building2 },
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
  const { t, i18n } = useTranslation();
  const cleanerUrl = withLang(CLEANER_URL, i18n.language);
  const lang = i18n.language;

  const navLinks = [
    { label: t("nav.howItWorks"), href: "#how" },
    { label: t("cleaner.whySweepr"), href: "#why" },
    { label: t("cleaner.coverage"), href: "#coverage" },
    { label: t("cleaner.forCustomers"), href: withLang("/", lang) },
  ];

  const steps = tab === "individual" ? INDIVIDUAL_STEPS : BUSINESS_STEPS;
  const perks = tab === "individual" ? INDIVIDUAL_PERKS : BUSINESS_PERKS;

  return (
    <MarketingShell
      navLinks={navLinks}
      cta={
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <a href={cleanerUrl}>
            <Button>{t("nav.becomeACleaner")}</Button>
          </a>
        </div>
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
              <Sparkles className="h-3.5 w-3.5" /> {t("cleanWithUs.badge")}
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black tracking-tight text-charcoal dark:text-white sm:text-5xl">
              {t("cleanWithUs.heroTitle")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500 dark:text-slate-400">
              {t("cleanWithUs.heroSubtitle")}
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
                  {tab === "individual" ? t("cleanWithUs.howIndividualTitle") : t("cleanWithUs.howBusinessTitle")}
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
                  {tab === "individual" ? t("cleanWithUs.howIndividualSubtitle") : t("cleanWithUs.howBusinessSubtitle")}
                </p>
              </div>
              <StepList steps={steps} />
            </section>

            {/* Why Sweepr */}
            <section id="why" className="py-16">
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-black text-charcoal dark:text-white">
                  {tab === "individual" ? t("cleanWithUs.whyIndividualTitle") : t("cleanWithUs.whyBusinessTitle")}
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
              {t("cleanWithUs.differenceTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-seafoam-50">
              {t("cleanWithUs.differenceBody")}
            </p>
          </div>
        </section>
      </div>

      {/* Coverage map */}
      <section id="coverage" className="bg-white py-4 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 pt-12 text-center">
          <h2 className="text-3xl font-black text-charcoal dark:text-white">
            {t("cleanWithUs.coverageTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            <MapPin className="mr-1 inline h-4 w-4 text-seafoam-600" />
            {t("cleanWithUs.coverageSubtitle")}
          </p>
        </div>
        <CoverageMapSection />
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-3xl font-black text-charcoal dark:text-white sm:text-4xl">
          {t("cleanWithUs.finalTitle")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
          {t("cleanWithUs.finalSubtitle")}
        </p>
        <a href={cleanerUrl} className="mt-8 inline-block">
          <Button size="lg">
            {t("nav.getStarted")} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </a>
      </section>
    </MarketingShell>
  );
}
