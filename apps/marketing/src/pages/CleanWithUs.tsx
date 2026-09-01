/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState, lazy, Suspense } from "react";
import { useSeo } from "../lib/useSeo";
import { useTranslation } from "react-i18next";
import { withLang } from "../i18n/languages";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { MarketingShell, Button, Accordion } from "@sweepr/ui";
import { Reveal } from "../components/Reveal";
import { ArrowRight } from "lucide-react";
// Mapbox GL JS (loaded by CoverageMapSection) is only needed once a visitor
// scrolls to the coverage-map section; this page is already code-split from
// the entry, so this keeps it out of the page's own chunk.
const CoverageMapSection = lazy(() =>
  import("../components/CoverageMapSection").then((m) => ({ default: m.CoverageMapSection })),
);

const CLEANER_URL =
  (import.meta.env.VITE_CLEANER_URL || "https://clean.getsweepr.com") + "/sign-up";

type Tab = "individual" | "business";

// ── Tab content ──────────────────────────────────────────────────────────────

interface StepItem {
  /** i18n key prefix under cleanWithUs (e.g. "ind1" -> ind1Title / ind1Body). */
  key: string;
}

const INDIVIDUAL_STEPS = [
  { key: "ind1" },
  { key: "ind2" },
  { key: "ind3" },
  { key: "ind4" },
  { key: "ind5" },
] as const;

const BUSINESS_STEPS = [
  { key: "biz1" },
  { key: "biz2" },
  { key: "biz3" },
  { key: "biz4" },
  { key: "biz5" },
] as const;

const INDIVIDUAL_PERKS = [
  { key: "perkInd1" },
  { key: "perkInd2" },
  { key: "perkInd3" },
  { key: "perkInd4" },
] as const;

const BUSINESS_PERKS = [
  { key: "perkBiz1" },
  { key: "perkBiz2" },
  { key: "perkBiz3" },
  { key: "perkBiz4" },
] as const;

/** Numbered editorial rows. The steps really are a sequence (sign-up →
 * verification → first payout), so the numbers carry information. */
function StepList({ steps }: { steps: readonly StepItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      {steps.map((s, i) => (
        <Reveal key={s.key} delayMs={i * 40}>
          <div className="grid gap-x-8 gap-y-1 border-b border-slate-200 py-7 dark:border-slate-700 sm:grid-cols-[3rem_minmax(0,4fr)_minmax(0,7fr)] sm:items-baseline">
            <span className="text-sm font-bold tabular-nums text-seafoam-700 dark:text-seafoam-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-xl font-extrabold tracking-tight text-charcoal dark:text-white">
              {t(`cleanWithUs.${s.key}Title`)}
            </h3>
            <p className="max-w-[60ch] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t(`cleanWithUs.${s.key}Body`)}
            </p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** Hairline-divided list, not an icon-card grid. */
function PerkList({ perks }: { perks: readonly StepItem[] }) {
  const { t } = useTranslation();
  return (
    <div>
      {perks.map((p, i) => (
        <Reveal
          key={p.key}
          delayMs={i * 60}
          className={`py-6 ${i > 0 ? "border-t border-slate-200 dark:border-slate-700" : "pt-0"}`}
        >
          <h3 className="text-lg font-extrabold tracking-tight text-charcoal dark:text-white">
            {t(`cleanWithUs.${p.key}Title`)}
          </h3>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-slate-600 dark:text-slate-400">
            {t(`cleanWithUs.${p.key}Body`)}
          </p>
        </Reveal>
      ))}
    </div>
  );
}

// ── Tab switcher ─────────────────────────────────────────────────────────────

function TabSwitch({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useTranslation();
  const tabs: { id: Tab; label: string }[] = [
    { id: "individual", label: t("cleanWithUs.tabIndividual") },
    { id: "business", label: t("cleanWithUs.tabBusiness") },
  ];
  return (
    <div className="flex w-full max-w-xl gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
      {tabs.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={active}
            className={`flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-colors duration-200 ease-out ${
              active
                ? "bg-seafoam-700 text-white shadow"
                : "text-slate-600 hover:text-charcoal dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CleanWithUs() {
  useSeo({ title: 'Become a Sweepr cleaner, flexible cleaning jobs, get paid fast', description: 'Apply to clean with Sweepr. Set your own schedule, get matched to jobs near you, and get paid through the platform. Background check and training required.', canonical: "https://getsweepr.com/clean-with-us" });
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
      {/* ── Hero: editorial headline, left-aligned, proof underneath ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <h1 className="sweepr-fade-up max-w-[15ch] text-[2.9rem] font-black leading-[1.02] tracking-[-0.035em] text-charcoal [text-wrap:balance] dark:text-white sm:text-6xl lg:text-7xl">
            {t("cleanWithUs.heroTitle")}
          </h1>
          <p className="sweepr-fade-up sweepr-fade-up-d1 mt-6 max-w-[52ch] text-lg leading-relaxed text-slate-700 dark:text-slate-300">
            {t("cleanWithUs.heroSubtitle")}
          </p>
          <div className="sweepr-fade-up sweepr-fade-up-d2 mt-8">
            <a href={cleanerUrl} className="inline-block">
              <Button size="lg">
                {t("nav.becomeACleaner")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </a>
          </div>
          {/* Proof, not adjectives. */}
          <ul className="sweepr-fade-up sweepr-fade-up-d3 mt-10 flex max-w-2xl flex-col gap-2 border-t border-slate-200 pt-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400 sm:flex-row sm:gap-0 sm:divide-x sm:divide-slate-200 dark:sm:divide-slate-700">
            <li className="sm:pr-5">{t("cleanWithUs.badge")}</li>
            <li className="sm:px-5">Background-checked through Yardstik</li>
            <li className="sm:pl-5">Tips go to you in full</li>
          </ul>
        </div>

        <div className="sweepr-fade-up sweepr-fade-up-d3 mt-12">
          <TabSwitch tab={tab} setTab={setTab} />
        </div>
      </section>

      {/* Tab content: remounts per tab so the entrance replays once */}
      <div className="mx-auto max-w-6xl px-4">
        <div key={tab} className="sweepr-fade-up">
          {/* How it works: a real sequence, so numbered rows */}
          <section id="how" className="scroll-mt-20 border-t border-slate-200 py-16 dark:border-slate-800">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
                {tab === "individual" ? t("cleanWithUs.howIndividualTitle") : t("cleanWithUs.howBusinessTitle")}
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-400">
                {tab === "individual" ? t("cleanWithUs.howIndividualSubtitle") : t("cleanWithUs.howBusinessSubtitle")}
              </p>
            </div>
            <StepList steps={steps} />
          </section>

          {/* Why Sweepr: asymmetric split: claim on the left, specifics on the right */}
          <section id="why" className="scroll-mt-20 py-16">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
              <div>
                <div className="lg:sticky lg:top-28">
                  <h2 className="text-3xl font-black leading-tight tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
                    {tab === "individual" ? t("cleanWithUs.whyIndividualTitle") : t("cleanWithUs.whyBusinessTitle")}
                  </h2>
                </div>
              </div>
              <PerkList perks={perks} />
            </div>
          </section>
        </div>

        {/* The name, shared across both paths */}
        <section className="py-16">
          <Reveal>
            <div className="rounded-3xl bg-seafoam-700 px-6 py-14 text-white sm:px-12 dark:bg-seafoam-800">
              <h2 className="max-w-2xl text-3xl font-black tracking-tight [text-wrap:balance]">
                {t("cleanWithUs.differenceTitle")}
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-seafoam-50">
                {t("cleanWithUs.differenceBody")}
              </p>
            </div>
          </Reveal>
        </section>
      </div>

      {/* Coverage map */}
      <section id="coverage" className="scroll-mt-20 bg-white py-4 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 pt-12">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-charcoal dark:text-white">
              {t("cleanWithUs.coverageTitle")}
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400">
              {t("cleanWithUs.coverageSubtitle")}
            </p>
          </Reveal>
        </div>
        <Suspense fallback={null}>
          <CoverageMapSection />
        </Suspense>
      </section>

      {/* Background check FAQ */}
      <section id="background-checks" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
            <Reveal>
              <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">
                {t("cleanWithUs.faqTitle")}
              </h2>
            </Reveal>
            <Reveal delayMs={60}>
              <Accordion items={[{ question: t("cleanWithUs.faqBgQ"), answer: t("cleanWithUs.faqBgA") }]} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
              {t("cleanWithUs.finalTitle")}
            </h2>
            <p className="mt-4 max-w-[52ch] text-slate-600 dark:text-slate-400">
              {t("cleanWithUs.finalSubtitle")}
            </p>
            <a href={cleanerUrl} className="mt-8 inline-block">
              <Button size="lg">
                {t("nav.getStarted")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </a>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
