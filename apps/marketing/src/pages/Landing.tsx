import { MarketingShell, Button, Accordion, SweeprLogo, NewsletterSubscribe, type AccordionItemData } from "@sweepr/ui";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { withLang } from "../i18n/languages";
import { motion } from "framer-motion";
import {
  MapPin,
  CalendarClock,
  Sparkles,
  ShieldCheck,
  BadgeCheck,
  HeartHandshake,
  Home,
  Truck,
  Repeat,
  ArrowRight,
  Star,
  Clock,
  CheckCircle2,
  PlusCircle,
  Building2,
} from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { HeroScene } from "../components/HeroScene";
import { QuoteCalculator } from "../components/QuoteCalculator";
import { MarketingAuth } from "../components/MarketingAuth";
import { CoverageMapSection } from "../components/CoverageMapSection";

const CUSTOMER_URL =
  (import.meta.env.VITE_CUSTOMER_URL || "https://app.getsweepr.com") + "/book";
const CLEANER_URL =
  (import.meta.env.VITE_CLEANER_URL || "https://clean.getsweepr.com") + "/sign-up";

const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 py-20 ${className}`}>
      {children}
    </section>
  );
}

const steps = [
  {
    icon: ShieldCheck,
    titleKey: "howItWorks.step1Title" as const,
    bodyKey: "howItWorks.step1Body" as const,
  },
  {
    icon: MapPin,
    titleKey: "howItWorks.step2Title" as const,
    bodyKey: "howItWorks.step2Body" as const,
  },
  {
    icon: CalendarClock,
    titleKey: "howItWorks.step3Title" as const,
    bodyKey: "howItWorks.step3Body" as const,
  },
  {
    icon: Star,
    titleKey: "howItWorks.step4Title" as const,
    bodyKey: "howItWorks.step4Body" as const,
  },
];

const services = [
  {
    icon: Home,
    nameKey: "services.standard" as const,
    price: 89,
    taglineKey: "services.standardTagline" as const,
    descKey: "services.standardDesc" as const,
    bestForKey: "services.standardBestFor" as const,
  },
  {
    icon: Sparkles,
    nameKey: "services.deep" as const,
    price: 149,
    taglineKey: "services.deepTagline" as const,
    descKey: "services.deepDesc" as const,
    bestForKey: "services.deepBestFor" as const,
  },
  {
    icon: Building2,
    nameKey: "services.apartment" as const,
    price: 99,
    taglineKey: "services.apartmentTagline" as const,
    descKey: "services.apartmentDesc" as const,
    bestForKey: "services.apartmentBestFor" as const,
  },
  {
    icon: Truck,
    nameKey: "services.moveIn" as const,
    price: 179,
    taglineKey: "services.moveInTagline" as const,
    descKey: "services.moveInDesc" as const,
    bestForKey: "services.moveInBestFor" as const,
  },
  {
    icon: Truck,
    nameKey: "services.moveOut" as const,
    price: 199,
    taglineKey: "services.moveOutTagline" as const,
    descKey: "services.moveOutDesc" as const,
    bestForKey: "services.moveOutBestFor" as const,
  },
  {
    icon: Repeat,
    nameKey: "services.recurring" as const,
    price: 79,
    taglineKey: "services.recurringTagline" as const,
    descKey: "services.recurringDesc" as const,
    bestForKey: "services.recurringBestFor" as const,
  },
  {
    icon: PlusCircle,
    nameKey: "services.addOns" as const,
    price: 0,
    taglineKey: "services.addOnsTagline" as const,
    descKey: "services.addOnsDesc" as const,
    bestForKey: "services.addOnsBestFor" as const,
  },
];

const trust = [
  {
    icon: ShieldCheck,
    titleKey: "trust.screenedTitle" as const,
    bodyKey: "trust.screenedBody" as const,
  },
  {
    icon: BadgeCheck,
    titleKey: "trust.liabilityTitle" as const,
    bodyKey: "trust.liabilityBody" as const,
  },
  {
    icon: Clock,
    titleKey: "trust.trackingTitle" as const,
    bodyKey: "trust.trackingBody" as const,
  },
  {
    icon: HeartHandshake,
    titleKey: "trust.guaranteeTitle" as const,
    bodyKey: "trust.guaranteeBody" as const,
  },
];

const pricingRows = [
  { home: "Studio apartment", service: "Standard", price: 89 },
  { home: "2 bed / 1 bath", service: "Standard", price: 154 },
  { home: "3 bed / 2 bath", service: "Deep Clean", price: 259 },
  { home: "4 bed / 3 bath house", service: "Move-Out", price: 384 },
];

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export default function Landing() {
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
      {/* Hero */}
      <div className="relative overflow-hidden">
        <HeroScene />
        <Section className="!py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.div variants={fadeUp} className="mb-6">
                <SweeprLogo size="2xl" />
              </motion.div>
              <motion.h1
                variants={fadeUp}
                className="mt-6 max-w-2xl text-5xl font-black leading-[1.05] tracking-tight text-charcoal dark:text-white sm:text-6xl lg:text-7xl"
              >
                {t("hero.title")}
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-lg text-lg text-slate-600 dark:text-slate-300">
                {t("hero.subtitle")}
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={() => (window.location.href = customerUrl)}>
                  {t("hero.cta")} <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>
                  {t("nav.services")}
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center lg:justify-end"
            >
              <QuoteCalculator pricingGated={pricingGated} />
            </motion.div>
          </div>
        </Section>
      </div>

      {/* How it works */}
      <Section id="how">
        <SectionHeading
          eyebrow={t("nav.howItWorks")}
          title={t("howItWorks.title")}
          subtitle={t("howItWorks.subtitle")}
        />
        <motion.div
          className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {steps.map((s, i) => (
            <motion.div
              key={s.titleKey}
              variants={fadeUp}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-500 text-white">
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold text-seafoam-600">{t("howItWorks.stepLabel", { n: i + 1 })}</p>
              <h3 className="mt-1 text-lg font-bold text-charcoal dark:text-white">{t(s.titleKey)}</h3>
              <p className="mt-2 text-sm text-slate-500">{t(s.bodyKey)}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Services */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="services">
          <SectionHeading
            eyebrow={t("nav.services")}
            title={t("services.title")}
            subtitle={t("services.subtitle")}
          />
          <motion.div
            className="mt-12 grid gap-6 sm:grid-cols-2"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            {services.map((s) => (
              <motion.div
                key={s.nameKey}
                variants={fadeUp}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-offwhite p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                style={{ borderLeft: "6px solid #14b8a6" }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-black text-charcoal dark:text-white">{t(s.nameKey)}</h3>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-seafoam-700 dark:text-seafoam-400">{t(s.taglineKey)}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500 leading-relaxed">{t(s.descKey)}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-seafoam-500" />
                    <span>{t(s.bestForKey)}</span>
                  </div>
                  <a
                    href={customerUrl}
                    className="inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700 whitespace-nowrap"
                  >
                    {t("services.bookNow")} <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </Section>
      </div>

      {/* Trust */}
      <Section id="trust">
        <SectionHeading
          eyebrow={t("trust.eyebrow")}
          title={t("trust.title")}
          subtitle={t("trust.subtitle")}
        />
        <motion.div
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {trust.map((item) => (
            <motion.div
              key={item.titleKey}
              variants={fadeUp}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-charcoal dark:text-white">{t(item.titleKey)}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{t(item.bodyKey)}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Pricing */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="pricing">
          {pricingGated ? (
            <div className="mx-auto max-w-xl text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-seafoam-50 dark:bg-seafoam-900/30 mb-6">
                <Sparkles className="w-7 h-7 text-seafoam-500" />
              </div>
              <h2 className="text-3xl font-black tracking-tight text-charcoal dark:text-white">
                {t("pricing.comingSoonTitle")}
              </h2>
              <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
                {t("pricing.comingSoonSubtitle")}
              </p>
              <div className="mt-8 max-w-sm mx-auto">
                <NewsletterSubscribe apiUrl={API} />
              </div>
            </div>
          ) : (
            <>
              <SectionHeading
                eyebrow={t("nav.pricing")}
                title={t("pricing.title")}
                subtitle={t("pricing.subtitle")}
              />
              <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-offwhite text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-5 py-3 font-medium">{t("pricing.colHome")}</th>
                      <th className="px-5 py-3 font-medium">{t("pricing.colService")}</th>
                      <th className="px-5 py-3 text-right font-medium">{t("pricing.colPrice")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pricingRows.map((r) => (
                      <tr key={r.home} className="bg-white dark:bg-slate-900">
                        <td className="px-5 py-3 text-charcoal dark:text-white">{r.home}</td>
                        <td className="px-5 py-3 text-slate-500">{r.service}</td>
                        <td className="px-5 py-3 text-right font-bold text-charcoal dark:text-white">{formatCurrency(r.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-8 text-center">
                <Button size="lg" onClick={() => (window.location.href = customerUrl)}>
                  {t("pricing.getQuote")} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Section>
      </div>

      {/* Coverage map */}
      <CoverageMapSection />

      {/* FAQ */}
      <Section id="faq">
        <SectionHeading eyebrow="FAQ" title={t("faq.title")} />
        <div className="mx-auto mt-10 max-w-2xl">
          <Accordion items={faqs} />
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <SweeprLogo size="sm" />
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
              <a href="#services" className="hover:text-seafoam-600">{t("nav.services")}</a>
              <a href="#pricing" className="hover:text-seafoam-600">{t("nav.pricing")}</a>
              <a href="#faq" className="hover:text-seafoam-600">{t("nav.faq")}</a>
              <a href="/status" className="hover:text-seafoam-600">{t("footer.status")}</a>
            </nav>
          </div>

          <NewsletterSubscribe apiUrl={import.meta.env.VITE_API_URL ?? ""} className="mt-4" />

          {/* Become a Sweepr — small footer section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-sm font-semibold text-charcoal dark:text-white">{t("cleaner.title")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t("cleaner.subtitle")}
            </p>
            <a
              href={cleanerUrl}
              className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700"
            >
              {t("cleaner.cta")} <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 dark:border-slate-800 sm:flex-row">
            <nav className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
              <a href="https://legal.getsweepr.com/privacy?ref=marketing" className="hover:text-seafoam-600">{t("footer.privacy")}</a>
              <a href="https://legal.getsweepr.com/terms?ref=marketing" className="hover:text-seafoam-600">{t("footer.terms")}</a>
              <a href="https://legal.getsweepr.com/contractor-agreement?ref=marketing" className="hover:text-seafoam-600">{t("footer.contractor")}</a>
              <button
                onClick={() => {
                  try { localStorage.removeItem("sweepr_cookie_consent"); } catch { /* noop */ }
                  window.location.reload();
                }}
                className="hover:text-seafoam-600"
              >
                {t("footer.cookieSettings")}
              </button>
            </nav>
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} Sweepr, Inc.</p>
          </div>
        </div>
      </footer>
    </MarketingShell>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div className="text-center" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
      <p className="text-sm font-bold uppercase tracking-wide text-seafoam-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black text-charcoal dark:text-white sm:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-3 max-w-xl text-slate-500">{subtitle}</p>}
    </motion.div>
  );
}
