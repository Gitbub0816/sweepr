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
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { lazy, Suspense } from "react";
import { HeroScene } from "../components/HeroScene";
import { QuoteCalculator } from "../components/QuoteCalculator";
import { MarketingAuth } from "../components/MarketingAuth";

// mapbox-gl (pulled in by CoverageMapSection) is large and only needed once
// a visitor scrolls to the coverage-map section, so it's excluded from the
// initial JS payload.
const CoverageMapSection = lazy(() =>
  import("../components/CoverageMapSection").then((m) => ({ default: m.CoverageMapSection })),
);

const CUSTOMER_URL =
  (import.meta.env.VITE_CUSTOMER_URL || "https://app.getsweepr.com") + "/book";
const CLEANER_URL =
  (import.meta.env.VITE_CLEANER_URL || "https://clean.getsweepr.com") + "/sign-up";

const services = [
  {
    nameKey: "services.standard" as const,
    price: 89,
    taglineKey: "services.standardTagline" as const,
    descKey: "services.standardDesc" as const,
    bestForKey: "services.standardBestFor" as const,
  },
  {
    nameKey: "services.deep" as const,
    price: 149,
    taglineKey: "services.deepTagline" as const,
    descKey: "services.deepDesc" as const,
    bestForKey: "services.deepBestFor" as const,
  },
  {
    nameKey: "services.apartment" as const,
    price: 99,
    taglineKey: "services.apartmentTagline" as const,
    descKey: "services.apartmentDesc" as const,
    bestForKey: "services.apartmentBestFor" as const,
  },
  {
    nameKey: "services.moveIn" as const,
    price: 179,
    taglineKey: "services.moveInTagline" as const,
    descKey: "services.moveInDesc" as const,
    bestForKey: "services.moveInBestFor" as const,
  },
  {
    nameKey: "services.moveOut" as const,
    price: 199,
    taglineKey: "services.moveOutTagline" as const,
    descKey: "services.moveOutDesc" as const,
    bestForKey: "services.moveOutBestFor" as const,
  },
  {
    nameKey: "services.recurring" as const,
    price: 79,
    taglineKey: "services.recurringTagline" as const,
    descKey: "services.recurringDesc" as const,
    bestForKey: "services.recurringBestFor" as const,
  },
  {
    nameKey: "services.addOns" as const,
    price: 0,
    taglineKey: "services.addOnsTagline" as const,
    descKey: "services.addOnsDesc" as const,
    bestForKey: "services.addOnsBestFor" as const,
  },
];

const trust = [
  { titleKey: "trust.screenedTitle" as const, bodyKey: "trust.screenedBody" as const },
  { titleKey: "trust.liabilityTitle" as const, bodyKey: "trust.liabilityBody" as const },
  { titleKey: "trust.trackingTitle" as const, bodyKey: "trust.trackingBody" as const },
  { titleKey: "trust.guaranteeTitle" as const, bodyKey: "trust.guaranteeBody" as const },
];

const pricingRows = [
  { home: "Studio apartment", service: "Standard", price: 89 },
  { home: "2 bed / 1 bath", service: "Standard", price: 154 },
  { home: "3 bed / 2 bath", service: "Deep Clean", price: 259 },
  { home: "4 bed / 3 bath house", service: "Move-Out", price: 384 },
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
    { label: t("nav.faq"), href: "#faq" },
    { label: t("nav.becomeACleaner"), href: cleanerUrl },
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
              <ul className="sweepr-fade-up sweepr-fade-up-d3 mt-10 flex max-w-xl flex-col gap-2 border-t border-slate-200 pt-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400 sm:flex-row sm:gap-0 sm:divide-x sm:divide-slate-200 dark:sm:divide-slate-700">
                <li className="sm:pr-5">Background-checked through Yardstik</li>
                <li className="sm:px-5">The exact price, before you book</li>
                <li className="sm:pl-5">No subscriptions required</li>
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
        <section id="services" className="mx-auto max-w-6xl px-4 py-24">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
              {t("services.title")}
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400">{t("services.subtitle")}</p>
          </Reveal>
          <div className="mt-12 border-t border-slate-200 dark:border-slate-700">
            {services.map((s) => (
              <Reveal key={s.nameKey}>
                <a
                  href={customerUrl}
                  className="group grid gap-x-8 gap-y-2 border-b border-slate-200 py-7 transition-colors hover:bg-offwhite dark:border-slate-700 dark:hover:bg-slate-800/40 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto] sm:items-baseline sm:px-3"
                >
                  <div>
                    <h3 className="text-xl font-extrabold tracking-tight text-charcoal dark:text-white">
                      {t(s.nameKey)}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-seafoam-700 dark:text-seafoam-400">{t(s.taglineKey)}</p>
                  </div>
                  <div>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(s.descKey)}</p>
                    <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-500">{t(s.bestForKey)}</p>
                  </div>
                  <div className="flex items-baseline gap-4 sm:flex-col sm:items-end sm:gap-1.5">
                    {s.price > 0 ? (
                      <p className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        from <span className="text-lg font-extrabold tabular-nums text-charcoal dark:text-white">{formatCurrency(s.price)}</span>
                      </p>
                    ) : (
                      <p className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">priced per item</p>
                    )}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold text-seafoam-700 dark:text-seafoam-400">
                      {t("services.bookNow")}
                      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ── Trust — asymmetric split: one claim, four specifics ── */}
      <section id="trust" className="mx-auto max-w-6xl px-4 py-24">
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
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-24">
          {pricingGated ? (
            <div className="mx-auto max-w-xl py-6 text-center">
              <h2 className="text-3xl font-black tracking-tight text-charcoal dark:text-white">
                {t("pricing.comingSoonTitle")}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                {t("pricing.comingSoonSubtitle")}
              </p>
              <div className="mx-auto mt-8 max-w-sm">
                <NewsletterSubscribe apiUrl={API} />
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
              <Reveal delayMs={80} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-offwhite text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">{t("pricing.colHome")}</th>
                      <th scope="col" className="px-5 py-3 font-medium">{t("pricing.colService")}</th>
                      <th scope="col" className="px-5 py-3 text-right font-medium">{t("pricing.colPrice")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pricingRows.map((r) => (
                      <tr key={r.home} className="bg-white dark:bg-slate-900">
                        <td className="px-5 py-3.5 text-charcoal dark:text-white">{r.home}</td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.service}</td>
                        <td className="px-5 py-3.5 text-right font-bold tabular-nums text-charcoal dark:text-white">{formatCurrency(r.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      <section id="faq" className="mx-auto max-w-6xl px-4 py-24">
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
              href={cleanerUrl}
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
