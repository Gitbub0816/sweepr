import { MarketingShell, Button, Accordion, SweeprLogo, NewsletterSubscribe, type AccordionItemData } from "@sweepr/ui";
import { motion } from "framer-motion";
import {
  MapPin,
  CalendarClock,
  Sparkles,
  ShieldCheck,
  BadgeCheck,
  MapPinned,
  HeartHandshake,
  Home,
  Truck,
  Repeat,
  ArrowRight,
} from "lucide-react";
import { formatCurrency } from "@sweepr/utils";
import { HeroScene } from "../components/HeroScene";
import { QuoteCalculator } from "../components/QuoteCalculator";
import { MarketingAuth } from "../components/MarketingAuth";

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
];

const steps = [
  { icon: MapPin, title: "Enter your address", body: "We show real availability from vetted cleaners in your area — no guessing." },
  { icon: CalendarClock, title: "Choose a service and time", body: "Pick from Standard, Deep, Move-out or Recurring. Pick a date that works." },
  { icon: ShieldCheck, title: "A verified cleaner shows up", body: "Background-checked, insured, and rated. You get a text when they're on the way." },
];

const services = [
  { icon: Home, name: "Standard Clean", price: 89, desc: "All rooms, surfaces, floors, and fixtures. Good for regular upkeep." },
  { icon: Sparkles, name: "Deep Clean", price: 149, desc: "Everything in a Standard, plus inside appliances, baseboards, and hard-to-reach areas." },
  { icon: Truck, name: "Move-in / Move-out", price: 199, desc: "Full empty-home clean for handover, lease end, or new arrival." },
  { icon: Repeat, name: "Recurring Plan", price: 79, desc: "Weekly or biweekly visits at a reduced rate. Same cleaner, consistent results." },
];

const trust = [
  { icon: ShieldCheck, title: "Background-checked", body: "Every cleaner passes identity verification and a background check before their first job." },
  { icon: BadgeCheck, title: "Insured", body: "Every booking is covered. If something goes wrong, it's on us." },
  { icon: MapPinned, title: "Live status updates", body: "Know when your cleaner is on the way, has arrived, and when they're done." },
  { icon: HeartHandshake, title: "Satisfaction guarantee", body: "If the job isn't right, report it within 48 hours and we'll fix it or refund it." },
];

const liveJobs = [
  { area: "•••• Maple Ave, Austin", service: "Deep Clean", price: 214, status: "In progress", tone: "bg-amber-100 text-amber-700" },
  { area: "•••• Sunset Blvd, LA", service: "Standard Clean", price: 124, status: "Cleaner on the way", tone: "bg-seafoam-100 text-seafoam-700" },
  { area: "•••• 5th St, Denver", service: "Move-out", price: 299, status: "Booked", tone: "bg-slate-100 text-slate-600" },
  { area: "•••• Bay Rd, Seattle", service: "Recurring", price: 99, status: "Completed", tone: "bg-emerald-100 text-emerald-700" },
];

const pricingRows = [
  { home: "Studio apartment", service: "Standard", price: 89 },
  { home: "2 bed / 1 bath", service: "Standard", price: 154 },
  { home: "3 bed / 2 bath", service: "Deep Clean", price: 259 },
  { home: "4 bed / 3 bath house", service: "Move-out", price: 384 },
];

const faqs: AccordionItemData[] = [
  { question: "How is pricing calculated?", answer: "You get an exact price before you book. It's based on your service type, number of bedrooms and bathrooms, and any add-ons. There are no hidden fees or charges after the fact." },
  { question: "How are cleaners vetted?", answer: "Every cleaner completes identity verification and a background check through a third-party provider before they can accept jobs on Sweepr. We also review their work history and ratings." },
  { question: "Can I cancel or reschedule?", answer: "Yes. You can cancel or reschedule for free up to 24 hours before your appointment. Changes made inside 24 hours may incur a fee." },
  { question: "What if the job isn't done right?", answer: "Report it within 48 hours and we'll send the cleaner back to fix it, or we'll refund the booking. No arguing about it." },
  { question: "Do cleaners bring their own supplies?", answer: "Yes. Cleaners arrive with professional equipment and supplies. If you'd prefer they use yours, leave a note when you book." },
  { question: "How do I know when my cleaner is arriving?", answer: "You get text and in-app updates when your cleaner is on the way and when they arrive. You can also see their location in real time." },
  { question: "How does recurring pricing work?", answer: "Recurring bookings are billed per visit at a lower rate than one-time cleans. You'll be matched with the same cleaner each time and can pause or cancel anytime." },
];

export default function Landing() {
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
                Professional home cleaning, booked online.
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-lg text-lg text-slate-600 dark:text-slate-300">
                See your price, pick a time, and book a background-checked, insured cleaner — all in a few minutes. We handle the logistics; you get a clean home.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={() => (window.location.href = CUSTOMER_URL)}>
                  Book a Cleaning <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => (window.location.href = CLEANER_URL)}>
                  Become a Cleaner
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
        <SectionHeading eyebrow="How it works" title="Book in under two minutes" />
        <motion.div className="mt-12 grid gap-6 md:grid-cols-3" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
          {steps.map((s, i) => (
            <motion.div key={s.title} variants={fadeUp} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
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

      {/* Services — DoorDash featured cards */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="services">
          <SectionHeading eyebrow="Services" title="What we clean" />
          <motion.div className="mt-12 grid gap-6 sm:grid-cols-2" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
            {services.map((s) => (
              <motion.div
                key={s.name}
                variants={fadeUp}
                className="flex items-center gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-offwhite p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                style={{ borderLeft: "6px solid #14b8a6" }}
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                  <s.icon className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-black text-charcoal dark:text-white">{s.name}</h3>
                    <span className="rounded-full bg-seafoam-500 px-3 py-1 text-xs font-bold text-white">
                      from {formatCurrency(s.price)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{s.desc}</p>
                  <a href={CUSTOMER_URL} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-seafoam-600 hover:text-seafoam-700">
                    Book now <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </Section>
      </div>

      {/* Live jobs marketplace mockup */}
      <Section id="live">
        <SectionHeading
          eyebrow="Active bookings"
          title="What's being cleaned right now"
          subtitle="A sample of recent Sweepr bookings. Addresses are partially hidden."
        />
        <motion.div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}>
          {liveJobs.map((j) => (
            <motion.div key={j.area} variants={fadeUp} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${j.tone}`}>{j.status}</span>
              <p className="mt-3 font-bold text-charcoal dark:text-white">{j.service}</p>
              <p className="mt-1 text-sm text-slate-400 blur-[1px] select-none">{j.area}</p>
              <p className="mt-3 text-lg font-black text-charcoal dark:text-white">{formatCurrency(j.price)}</p>
            </motion.div>
          ))}
        </motion.div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Illustrative only. Figures and locations are examples, not real customer data.
        </p>
      </Section>

      {/* Why Sweepr */}
      <Section id="why">
        <SectionHeading eyebrow="Why Sweepr" title="What we stand behind" />
        <motion.div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
          {trust.map((t) => (
            <motion.div key={t.title} variants={fadeUp} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <t.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-charcoal dark:text-white">{t.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{t.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Cleaner recruitment band */}
      <div className="bg-charcoal">
        <Section className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-seafoam-400">For cleaning professionals</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-4xl font-black text-white sm:text-5xl">
            Earn <span className="text-seafoam-400">$28–$45/hr</span> on your own schedule.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-seafoam-100/80">
            Sweepr handles booking, payment, and customer support. You focus on the work. Apply online and start accepting jobs once approved.
          </p>
          <div className="mt-8 flex justify-center">
            <Button size="lg" onClick={() => (window.location.href = CLEANER_URL)}>
              Become a Cleaner <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-xs text-seafoam-100/50">
            Cleaners are independent contractors.{" "}
            <a href="https://legal.getsweepr.com/contractor-agreement?ref=marketing" className="underline">Learn more</a>.
          </p>
        </Section>
      </div>

      {/* Pricing teaser */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="pricing">
          <SectionHeading eyebrow="Pricing" title="Upfront pricing, no surprises" subtitle="Your exact price is shown before you book. Here are some examples." />
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
        </Section>
      </div>

      {/* FAQ */}
      <Section id="faq">
        <SectionHeading eyebrow="FAQ" title="Common questions" />
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
              <a href={CLEANER_URL} className="hover:text-seafoam-600">Cleaners</a>
              <a href="#faq" className="hover:text-seafoam-600">FAQ</a>
            </nav>
          </div>
          <NewsletterSubscribe apiUrl={import.meta.env.VITE_API_URL ?? ""} className="mt-4" />
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
