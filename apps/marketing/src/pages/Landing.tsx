/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { MarketingShell, Button, Accordion, SweeprLogo, NewsletterSubscribe, type AccordionItemData } from "@sweepr/ui";
import { useSeo } from "../lib/useSeo";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { withLang } from "../i18n/languages";
import { Reveal } from "../components/Reveal";
import { HowItWorksSection } from "../components/HowItWorksSection";
import { ArrowRight, Check } from "lucide-react";
import { lazy, Suspense } from "react";
import { HeroScene } from "../components/HeroScene";
import { QuoteCalculator } from "../components/QuoteCalculator";
import { MarketingAuth } from "../components/MarketingAuth";

// MapKit JS (loaded by CoverageMapSection from Apple's CDN) is only needed
// once a visitor scrolls to the coverage-map section, so the section is
// excluded from the initial JS payload.
const CoverageMapSection = lazy(() =>
  import("../components/CoverageMapSection").then((m) => ({ default: m.CoverageMapSection })),
);

const CUSTOMER_URL =
  (import.meta.env.VITE_CUSTOMER_URL || "https://app.getsweepr.com") + "/book";
const CLEANER_URL =
  (import.meta.env.VITE_CLEANER_URL || "https://clean.getsweepr.com") + "/sign-up";

const useCases = [
  { key: "tidying" },
  { key: "deep" },
  { key: "reorganizing" },
  { key: "rental" },
  { key: "move" },
  { key: "recurring" },
] as const;

const trust = [
  { titleKey: "trust.screenedTitle" as const, bodyKey: "trust.screenedBody" as const },
  { titleKey: "trust.liabilityTitle" as const, bodyKey: "trust.liabilityBody" as const },
  { titleKey: "trust.trackingTitle" as const, bodyKey: "trust.trackingBody" as const },
  { titleKey: "trust.guaranteeTitle" as const, bodyKey: "trust.guaranteeBody" as const },
];


const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** Small uppercase label. The only sanctioned "eyebrow" treatment: 11px,
 * tracked, no background, no border, no pill. Used sparingly. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </p>
  );
}

export default function Landing() {
  useSeo({ title: 'Sweepr, Home cleaning, ordered like delivery', description: 'Book trusted, background-checked home cleaners in minutes. Transparent pricing shown before you book, real-time tracking, and a satisfaction guarantee.', canonical: "https://getsweepr.com/" });
  const { t, i18n } = useTranslation();
  const [pricingGated, setPricingGated] = useState(false);

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json() as Promise<{ settings?: { prelaunch_pricing?: boolean } }>)
      .then((d) => { if (d.settings?.prelaunch_pricing) setPricingGated(true); })
      .catch(() => {});
  }, []);

  const lang = i18n.language;
  const customerUrl = withLang(CUSTOMER_URL, lang);
  const cleanerUrl = withLang(CLEANER_URL, lang);

  const navLinks = [
    { label: t("nav.howItWorks"), href: "#how" },
    { label: t("nav.services"), href: "#services" },
    { label: t("nav.pricing"), href: "#pricing" },
    { label: t("nav.getQuote", "Get a quote"), href: "/quote" },
    { label: t("nav.faq"), href: "#faq" },
    { label: t("nav.becomeACleaner"), href: "/clean-with-us" },
  ];

  const faqs: AccordionItemData[] = [
    { question: t("faq.q1"), answer: t("faq.a1") },
    { question: t("faq.q2"), answer: t("faq.a2") },
    { question: t("faq.q3"), answer: t("faq.a3") },
    { question: t("faq.q4"), answer: t("faq.a4") },
    { question: t("faq.q5"), answer: t("faq.a5") },
    { question: t("faq.q6"), answer: t("faq.a6") },
    { question: t("faq.q7"), answer: t("faq.a7") },
    { question: t("faq.q8"), answer: t("faq.a8") },
    { question: t("faq.q9"), answer: t("faq.a9") },
  ];

  return (
    <MarketingShell
      navLinks={navLinks}
      cta={
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <MarketingAuth
            cta={
              <Button onClick={() => (window.location.href = customerUrl)}>
                {t("nav.getStarted")}
              </Button>
            }
          />
        </div>
      }
    >
      {/* ── Hero — editorial headline, quote widget as the visual anchor ── */}
      <div className="relative overflow-hidden">
        <HeroScene />
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24 lg:pb-28">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
            <div className="pt-2">
              <h1 className="sweepr-fade-up max-w-[13ch] text-[2.9rem] font-black leading-[1.02] tracking-[-0.035em] text-charcoal [text-wrap:balance] dark:text-white sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
                {t("hero.title")}
              </h1>
              <p className="sweepr-fade-up sweepr-fade-up-d1 mt-6 max-w-[52ch] text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                {t("hero.subtitle")}
              </p>
              <div className="sweepr-fade-up sweepr-fade-up-d2 mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button size="lg" onClick={() => (window.location.href = customerUrl)}>
                  {t("hero.cta")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>
                  {t("nav.services")}
                </Button>
              </div>
              {/* Proof, not adjectives. */}
              <ul className="sweepr-fade-up sweepr-fade-up-d3 mt-10 flex max-w-xl flex-col gap-2.5 border-t border-slate-200 pt-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400 sm:flex-row sm:gap-0 sm:divide-x sm:divide-slate-200 dark:sm:divide-slate-700">
                <li className="flex items-center gap-2.5 sm:gap-0 sm:pr-5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300 sm:hidden"><Check aria-hidden="true" className="h-3 w-3" /></span>Background-checked through Yardstik</li>
                <li className="flex items-center gap-2.5 sm:gap-0 sm:px-5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300 sm:hidden"><Check aria-hidden="true" className="h-3 w-3" /></span>The exact price, before you book</li>
                <li className="flex items-center gap-2.5 sm:gap-0 sm:pl-5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300 sm:hidden"><Check aria-hidden="true" className="h-3 w-3" /></span>No subscriptions required</li>
              </ul>
            </div>

            <div className="sweepr-fade-up sweepr-fade-up-d2 flex justify-center lg:justify-end lg:pt-3">
              <QuoteCalculator pricingGated={pricingGated} />
            </div>
          </div>
        </section>
      </div>

      {/* ── Services — editorial price list, not a card grid ── */}
      <div className="bg-white dark:bg-slate-900/40">
        <section id="services" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
              {t("useCases.title", "See how Sweepr can work for you")}
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400">
              {t("useCases.subtitle", "Every home is different. Tell us what yours needs and we'll match the right cleaner to the job.")}
            </p>
          </Reveal>
          {/* Mobile: swipeable editorial panels instead of stacked rows. */}
          {/* The section is block-level and viewport-bound (max-w-6xl px-4), so
              -mx-4 bleeds this scroller exactly to the viewport edges; the
              overflow-x-auto keeps the wide row scrolling instead of widening
              the page. Cards are fractional width so they can never exceed it. */}
          <div className="-mx-4 mt-10 flex w-auto max-w-none snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
            {useCases.map((u, i) => (
              <a
                key={u.key}
                href="/quote"
                className="flex min-h-full w-[82%] max-w-[20rem] shrink-0 snap-start flex-col justify-between rounded-2xl border border-slate-200 bg-offwhite p-5 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <div>
                  <span className="text-[11px] font-black tabular-nums text-slate-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-lg font-extrabold tracking-tight text-charcoal dark:text-white">
                    {t(`useCases.${u.key}.name`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t(`useCases.${u.key}.bio`)}
                  </p>
                </div>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-seafoam-700 dark:text-seafoam-400">
                  {t("useCases.cta", "Get started")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </a>
            ))}
          </div>

          <div className="mt-12 hidden border-t border-slate-200 dark:border-slate-700 sm:block">
            {useCases.map((u) => (
              <Reveal key={u.key}>
                <a
                  href="/quote"
                  className="group grid gap-x-8 gap-y-2 border-b border-slate-200 py-7 transition-colors hover:bg-offwhite dark:border-slate-700 dark:hover:bg-slate-800/40 sm:grid-cols-[minmax(0,4fr)_minmax(0,7fr)_auto] sm:items-baseline sm:px-3"
                >
                  <h3 className="text-xl font-extrabold tracking-tight text-charcoal dark:text-white">
                    {t(`useCases.${u.key}.name`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t(`useCases.${u.key}.bio`)}
                  </p>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold text-seafoam-700 dark:text-seafoam-400">
                    {t("useCases.cta", "Get started")}
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ── Trust — asymmetric split: one claim, four specifics ── */}
      <section id="trust" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <Label>{t("trust.eyebrow")}</Label>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
                {t("trust.title")}
              </h2>
              <p className="mt-4 text-slate-600 dark:text-slate-400">{t("trust.subtitle")}</p>
            </div>
          </Reveal>
          <div>
            {trust.map((item, i) => (
              <Reveal
                key={item.titleKey}
                delayMs={i * 60}
                className={`py-7 ${i > 0 ? "border-t border-slate-200 dark:border-slate-700" : "pt-0"}`}
              >
                <h3 className="text-lg font-extrabold tracking-tight text-charcoal dark:text-white">{t(item.titleKey)}</h3>
                <p className="mt-2 max-w-[60ch] leading-relaxed text-slate-600 dark:text-slate-400">{t(item.bodyKey)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <div className="bg-white dark:bg-slate-900/40">
        <section id="pricing" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
          {pricingGated ? (
            <div className="mx-auto max-w-xl py-6 text-center">
              <Label>{t("pricing.gatedEyebrow", "Instant quote")}</Label>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-charcoal dark:text-white">
                {t("pricing.gatedTitle", "Know your price before you book")}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                {t("pricing.gatedSubtitle", "Answer five questions, see your exact price.")}
              </p>
              <div className="mt-8">
                <Button size="lg" onClick={() => (window.location.href = "/quote")}>
                  {t("pricing.gatedCta", "Get a quote")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
              <Reveal>
                <h2 className="text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
                  {t("pricing.title")}
                </h2>
                <p className="mt-4 text-slate-600 dark:text-slate-400">{t("pricing.subtitle")}</p>
                <div className="mt-8">
                  <Button size="lg" onClick={() => (window.location.href = customerUrl)}>
                    {t("pricing.getQuote")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              </Reveal>
              <Reveal delayMs={80}>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                  {[
                    { title: t("pricing.point1Title", "Your quote is exact, not an estimate"), body: t("pricing.point1Body", "Answer a few questions about your home and see the full price before you confirm. That number doesn't change unless you change the job.") },
                    { title: t("pricing.point2Title", "No subscriptions, no memberships required"), body: t("pricing.point2Body", "Book once or set a schedule. Either way you only pay for cleanings that happen.") },
                    { title: t("pricing.point3Title", "Paid after the clean"), body: t("pricing.point3Body", "Booking places a temporary hold on your card. The payment itself goes through once the work is done. Tips are optional and go to your cleaner in full.") },
                  ].map((row) => (
                    <li key={row.title} className="px-6 py-5">
                      <p className="font-bold text-charcoal dark:text-white">{row.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{row.body}</p>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          )}
        </section>
      </div>

      {/* Coverage map */}
      <Suspense fallback={null}>
        <CoverageMapSection />
      </Suspense>

      {/* How it works — the interactive journey map (scroll showpiece) */}
      <HowItWorksSection />

      {/* ── FAQ ── */}
      <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <Reveal>
            <p className="text-[11px] font-black uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
              {t("teamNote.eyebrow", "From the team")}
            </p>
            <blockquote className="mt-5 text-2xl font-bold leading-snug tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-3xl">
              {t("teamNote.quote", "We started Sweepr because hiring a cleaner shouldn't feel like a gamble. You should know who's coming, what it costs, and that someone stands behind the work.")}
            </blockquote>
            <p className="mt-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("teamNote.body", "So that's what we built: verified people, exact prices, and payment only after the job is done. If something isn't right, a human on our team looks at it. That's the whole pitch.")}
            </p>
            <p className="mt-5 text-sm font-semibold text-charcoal dark:text-white">{t("teamNote.signoff", "The Sweepr team")}</p>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <Reveal>
            <h2 className="text-3xl font-black tracking-tight text-charcoal dark:text-white sm:text-4xl">{t("faq.title")}</h2>
            <p className="mt-4 max-w-[40ch] text-slate-600 dark:text-slate-400">{t("faq.subtitle")}</p>
          </Reveal>
          <Reveal delayMs={80}>
            <Accordion items={faqs} />
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <SweeprLogo size="sm" />
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
              <a href="#services" className="hover:text-seafoam-700">{t("nav.services")}</a>
              <a href="#pricing" className="hover:text-seafoam-700">{t("nav.pricing")}</a>
              <a href="#faq" className="hover:text-seafoam-700">{t("nav.faq")}</a>
              <a href="/status" className="hover:text-seafoam-700">{t("footer.status")}</a>
            </nav>
          </div>

          <NewsletterSubscribe apiUrl={import.meta.env.VITE_API_URL ?? ""} className="mt-4" />

          {/* Become a Sweepr, small footer section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-sm font-semibold text-charcoal dark:text-white">{t("cleaner.title")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t("cleaner.subtitle")}
            </p>
            <a
              href="/clean-with-us"
              className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-seafoam-700 hover:text-seafoam-800"
            >
              {t("cleaner.cta")} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 dark:border-slate-800 sm:flex-row">
            <nav className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
              <a href="https://legal.getsweepr.com/privacy?ref=marketing" className="hover:text-seafoam-700">{t("footer.privacy")}</a>
              <a href="https://legal.getsweepr.com/terms?ref=marketing" className="hover:text-seafoam-700">{t("footer.terms")}</a>
              <a href="https://legal.getsweepr.com/contractor-agreement?ref=marketing" className="hover:text-seafoam-700">{t("footer.contractor")}</a>
              <a href="/privacy-request?type=opt_out" className="hover:text-seafoam-700">{t("footer.doNotSell")}</a>
              <a href="/accessibility" className="hover:text-seafoam-700">Accessibility</a>
              <button
                onClick={() => {
                  try { localStorage.removeItem("sweepr_cookie_consent"); } catch { /* noop */ }
                  window.location.reload();
                }}
                className="hover:text-seafoam-700"
              >
                {t("footer.cookieSettings")}
              </button>
            </nav>
            <p className="text-xs text-slate-500">Copyright © 2026–Present Sweepr, operated by ClearKey Solutions, LLC. All Rights Reserved.</p>
          </div>
        </div>
      </footer>
    </MarketingShell>
  );
}
