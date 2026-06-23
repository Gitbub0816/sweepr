import { MarketingShell, Button, Accordion, SweeprLogo, NewsletterSubscribe, type AccordionItemData } from "@sweepr/ui";
import { useState, useEffect } from "react";
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

const navLinks = [
  { label: "How it works", href: "#how" },
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Become a Sweepr", href: CLEANER_URL },
];

const steps = [
  {
    icon: MapPin,
    title: "Choose your service",
    body: "Standard clean, deep clean, move-in, move-out, recurring — pick what your home actually needs right now.",
  },
  {
    icon: CalendarClock,
    title: "Pick a time",
    body: "See real availability in your area and book a slot that fits your week, not the other way around.",
  },
  {
    icon: ShieldCheck,
    title: "Get matched with a qualified Sweepr",
    body: "Every Sweepr in our marketplace has completed identity verification, training, and background screening. You get a text when they're on the way.",
  },
  {
    icon: Star,
    title: "Enjoy a cleaner home",
    body: "Come back to something that feels genuinely different. If it's not right, we'll make it right — no back-and-forth required.",
  },
];

const services = [
  {
    icon: Home,
    name: "Standard Clean",
    price: 89,
    tagline: "Regular upkeep, consistently done right.",
    desc: "All rooms, surfaces, floors, and fixtures get the attention they need. Bathrooms cleaned and sanitised, kitchen wiped down, floors swept and mopped. The kind of clean that resets a home without requiring you to be there for it.",
    bestFor: "Weekly or biweekly maintenance",
  },
  {
    icon: Sparkles,
    name: "Deep Clean",
    price: 149,
    tagline: "When standard isn't enough.",
    desc: "Everything in a Standard Clean, plus inside appliances, baseboards, window sills, light switches, ceiling fans, and all those spots that collect a surprising amount of history. A genuine reset for a home that needs one.",
    bestFor: "First-time bookings, seasonal resets, or pre-event prep",
  },
  {
    icon: Building2,
    name: "Apartment Clean",
    price: 99,
    tagline: "Sized for your space, not a four-bedroom house.",
    desc: "Full clean tailored to apartments and condos. Everything cleaned thoroughly without padding the time or the price for rooms you don't have.",
    bestFor: "Studio to two-bedroom apartments",
  },
  {
    icon: Truck,
    name: "Move-In Clean",
    price: 179,
    tagline: "Start fresh in a space that's actually clean.",
    desc: "A full empty-home clean before your things go in. Inside cabinets, closets, appliances, and every surface — so your new place feels like yours from day one.",
    bestFor: "New tenants and homeowners before moving in",
  },
  {
    icon: Truck,
    name: "Move-Out Clean",
    price: 199,
    tagline: "Leave the place better than you found it.",
    desc: "Designed to meet lease-end standards. Full empty-home clean including inside appliances, inside cabinets, all fixtures, and floors. The kind of clean that tends to get deposits back.",
    bestFor: "End of lease or sale handover",
  },
  {
    icon: Repeat,
    name: "Recurring Service",
    price: 79,
    tagline: "Your home, kept. Without thinking about it.",
    desc: "Weekly or biweekly visits at a lower per-visit rate. You're matched with the same Sweepr each time, so they know your home and you don't have to explain it again. Pause or cancel anytime.",
    bestFor: "Anyone who wants a consistently clean home without the effort",
  },
  {
    icon: PlusCircle,
    name: "Add-Ons",
    price: 0,
    tagline: "Extra attention where you need it.",
    desc: "Inside fridge, inside oven, interior windows, laundry, organisation, or a longer clean for a larger home. Add them at booking — your price updates immediately.",
    bestFor: "Any booking that needs something extra",
  },
];

const trust = [
  {
    icon: ShieldCheck,
    title: "Verified before they ever arrive",
    body: "Every active Sweepr completes identity verification, training, and background screening before they enter the marketplace. Not once — at onboarding and on an ongoing basis.",
  },
  {
    icon: BadgeCheck,
    title: "Every booking is insured",
    body: "Something going wrong is rare. Knowing it's covered shouldn't be. Every Sweepr booking carries liability coverage so you don't have to think about it.",
  },
  {
    icon: Clock,
    title: "Live status updates",
    body: "You'll know when your Sweepr is on the way, when they arrive, and when your home is done. No wondering, no waiting by the door.",
  },
  {
    icon: HeartHandshake,
    title: "Satisfaction guarantee",
    body: "If the job isn't right, report it within 48 hours. We'll send someone back to fix it or refund the booking. No negotiating required.",
  },
];

const pricingRows = [
  { home: "Studio apartment", service: "Standard", price: 89 },
  { home: "2 bed / 1 bath", service: "Standard", price: 154 },
  { home: "3 bed / 2 bath", service: "Deep Clean", price: 259 },
  { home: "4 bed / 3 bath house", service: "Move-Out", price: 384 },
];

const faqs: AccordionItemData[] = [
  {
    question: "How is pricing calculated?",
    answer:
      "Your exact price is shown before you book — based on service type, number of bedrooms and bathrooms, and any add-ons you select. There are no hidden fees, no charges after the fact, and no surprises when the invoice arrives.",
  },
  {
    question: "How are Sweeprs vetted?",
    answer:
      "Every Sweepr completes identity verification, a third-party background check, and training before they can accept jobs on the platform. We review work history and ratings on an ongoing basis. If a Sweepr's standards slip, they don't stay active.",
  },
  {
    question: "Can I cancel or reschedule?",
    answer:
      "Yes. Cancel or reschedule for free up to 24 hours before your appointment. Changes made inside that window may incur a small fee.",
  },
  {
    question: "What if the job isn't done right?",
    answer:
      "Report it within 48 hours and we'll send your Sweepr back to fix it — or refund the booking. We're not interested in arguing about it.",
  },
  {
    question: "Do Sweeprs bring their own supplies?",
    answer:
      "Yes. Every Sweepr arrives with professional-grade equipment and supplies. If you'd prefer they use yours instead, leave a note when you book.",
  },
  {
    question: "Will I get the same Sweepr each time?",
    answer:
      "On a recurring plan, yes — you're matched with the same Sweepr so they know your home and your preferences. For one-time bookings, you can request a specific Sweepr if you've used one before.",
  },
  {
    question: "How does recurring pricing work?",
    answer:
      "Recurring bookings are billed per visit at a lower rate than one-time cleans. You'll be matched with the same Sweepr each time. Pause or cancel anytime — no lock-in.",
  },
  {
    question: "What areas does Sweepr serve?",
    answer:
      "Enter your address when you book and we'll show you real availability in your area. We're expanding regularly — if we're not in your city yet, you can join the waitlist.",
  },
];

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export default function Landing() {
  const [pricingGated, setPricingGated] = useState(false);

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json() as Promise<{ settings?: { prelaunch_pricing?: boolean } }>)
      .then((d) => { if (d.settings?.prelaunch_pricing) setPricingGated(true); })
      .catch(() => {});
  }, []);

  return (
    <MarketingShell
      navLinks={navLinks}
      cta={
        <MarketingAuth
          cta={
            <Button onClick={() => (window.location.href = CUSTOMER_URL)}>
              Book a Cleaning
            </Button>
          }
        />
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
                A cleaner home without rearranging your life.
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-lg text-lg text-slate-600 dark:text-slate-300">
                Book trusted home cleaning in minutes. One-time cleans, recurring service, deep cleans, move-outs, and more — all with upfront pricing and a satisfaction guarantee.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={() => (window.location.href = CUSTOMER_URL)}>
                  Book a Cleaning <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>
                  View Services
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center lg:justify-end"
            >
              <QuoteCalculator />
            </motion.div>
          </div>
        </Section>
      </div>

      {/* How it works */}
      <Section id="how">
        <SectionHeading
          eyebrow="How it works"
          title="From booking to clean home in four steps"
          subtitle="The whole process takes a few minutes. The result lasts all week."
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
              key={s.title}
              variants={fadeUp}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-500 text-white">
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold text-seafoam-600">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-bold text-charcoal dark:text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Services */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="services">
          <SectionHeading
            eyebrow="Services"
            title="The right clean for the right moment"
            subtitle="Every home is different. Every week is different. Pick the service that fits."
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
                key={s.name}
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
                      <h3 className="text-lg font-black text-charcoal dark:text-white">{s.name}</h3>
                      {s.price > 0 && (
                        <span className="rounded-full bg-seafoam-500 px-3 py-1 text-xs font-bold text-white whitespace-nowrap">
                          from {formatCurrency(s.price)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-seafoam-700 dark:text-seafoam-400">{s.tagline}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-seafoam-500" />
                    <span>{s.bestFor}</span>
                  </div>
                  <a
                    href={CUSTOMER_URL}
                    className="inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700 whitespace-nowrap"
                  >
                    Book now <ArrowRight className="h-4 w-4" />
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
          eyebrow="Why Sweepr"
          title="Letting someone into your home takes trust. We take that seriously."
          subtitle="The people who clean through Sweepr aren't just available — they're qualified."
        />
        <motion.div
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {trust.map((t) => (
            <motion.div
              key={t.title}
              variants={fadeUp}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <t.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-charcoal dark:text-white">{t.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{t.body}</p>
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
                We're still polishing the price tags.
              </h2>
              <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
                Our pricing calculator is getting a final deep clean. Join the newsletter and we'll let you know as soon as the numbers are finalized.
              </p>
              <div className="mt-8 max-w-sm mx-auto">
                <NewsletterSubscribe apiUrl={API} />
              </div>
            </div>
          ) : (
            <>
              <SectionHeading
                eyebrow="Pricing"
                title="Upfront pricing, no surprises"
                subtitle="Your exact price is shown before you book. Here are some common examples — use the calculator to get your number."
              />
              <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-offwhite text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-5 py-3 font-medium">Home</th>
                      <th className="px-5 py-3 font-medium">Service</th>
                      <th className="px-5 py-3 text-right font-medium">Est. price</th>
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
                <Button size="lg" onClick={() => (window.location.href = CUSTOMER_URL)}>
                  See your price <ArrowRight className="h-4 w-4" />
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
        <SectionHeading eyebrow="FAQ" title="Good questions" />
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
              <a href="#services" className="hover:text-seafoam-600">Services</a>
              <a href="#pricing" className="hover:text-seafoam-600">Pricing</a>
              <a href="#faq" className="hover:text-seafoam-600">FAQ</a>
            </nav>
          </div>

          <NewsletterSubscribe apiUrl={import.meta.env.VITE_API_URL ?? ""} className="mt-4" />

          {/* Become a Sweepr — small footer section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-sm font-semibold text-charcoal dark:text-white">Provide cleaning services through Sweepr</p>
            <p className="mt-1 text-sm text-slate-500">
              Learn about training, requirements, and available service areas.
            </p>
            <a
              href={CLEANER_URL}
              className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700"
            >
              Become a Sweepr <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 dark:border-slate-800 sm:flex-row">
            <nav className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
              <a href="https://legal.getsweepr.com/privacy?ref=marketing" className="hover:text-seafoam-600">Privacy Policy</a>
              <a href="https://legal.getsweepr.com/terms?ref=marketing" className="hover:text-seafoam-600">Terms of Service</a>
              <a href="https://legal.getsweepr.com/contractor-agreement?ref=marketing" className="hover:text-seafoam-600">Contractor Disclosure</a>
              <button
                onClick={() => {
                  try { localStorage.removeItem("sweepr_cookie_consent"); } catch { /* noop */ }
                  window.location.reload();
                }}
                className="hover:text-seafoam-600"
              >
                Cookie Settings
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
