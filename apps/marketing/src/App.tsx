import { MarketingShell, Button, Accordion, type AccordionItemData } from "@sweepr/ui";
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

const CUSTOMER_URL =
  import.meta.env.VITE_CUSTOMER_URL || "https://app.sweep-r.com";
const CLEANER_URL =
  import.meta.env.VITE_CLEANER_URL || "https://clean.sweep-r.com";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  show: { transition: { staggerChildren: 0.12 } },
};

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
  {
    icon: MapPin,
    title: "Enter your address",
    body: "Tell us where you live and we'll show availability near you.",
  },
  {
    icon: CalendarClock,
    title: "Pick a service & time",
    body: "Choose Standard, Deep, Move-out or Recurring — then a time that works.",
  },
  {
    icon: Sparkles,
    title: "A trusted cleaner arrives",
    body: "Track them in real time and relax. Satisfaction guaranteed.",
  },
];

const services = [
  { icon: Home, name: "Standard Clean", price: 89, desc: "Routine top-to-bottom tidy." },
  { icon: Sparkles, name: "Deep Clean", price: 149, desc: "Detailed, intensive reset." },
  { icon: Truck, name: "Move-in / Move-out", price: 199, desc: "Empty-home spotless clean." },
  { icon: Repeat, name: "Recurring Clean", price: 79, desc: "Weekly or biweekly, save more." },
];

const trust = [
  { icon: ShieldCheck, title: "Background-checked", body: "Every cleaner is vetted before their first job." },
  { icon: BadgeCheck, title: "Insured & verified", body: "Fully insured cleans for total peace of mind." },
  { icon: MapPinned, title: "Track in real-time", body: "See your cleaner en route, just like delivery." },
  { icon: HeartHandshake, title: "Satisfaction guarantee", body: "Not happy? We'll make it right, free." },
];

const pricingRows = [
  { home: "Studio apartment", service: "Standard", price: 89 },
  { home: "2 bed / 1 bath", service: "Standard", price: 154 },
  { home: "3 bed / 2 bath", service: "Deep Clean", price: 259 },
  { home: "4 bed / 3 bath house", service: "Move-out", price: 384 },
];

const faqs: AccordionItemData[] = [
  { question: "How does Sweepr pricing work?", answer: "Pricing is instant and transparent. We start with a base price for your service, then add for bedrooms, bathrooms, square footage and any add-ons you choose. No surprises at checkout." },
  { question: "Are cleaners background-checked?", answer: "Yes. Every Sweepr cleaner passes an identity and background check, plus an onboarding review before they can accept jobs." },
  { question: "Can I reschedule or cancel?", answer: "Absolutely. You can reschedule or cancel free of charge up to 24 hours before your appointment from your bookings page." },
  { question: "What if I'm not satisfied?", answer: "Our satisfaction guarantee means if something isn't right, report it within 48 hours and we'll arrange a re-clean or refund." },
  { question: "Do I need to provide supplies?", answer: "Cleaners bring their own professional supplies and equipment by default. You can leave a note if you'd prefer they use yours." },
  { question: "How do I track my cleaner?", answer: "Once your cleaner is on the way you'll get live status updates — on the way, arrived, in progress and completed — right in the app." },
  { question: "Is recurring cleaning cheaper?", answer: "Yes. Recurring plans start at just $79 per visit, our lowest per-visit rate, and you keep the same trusted cleaner." },
];

export default function App() {
  return (
    <MarketingShell
      navLinks={navLinks}
      cta={
        <Button onClick={() => (window.location.href = CUSTOMER_URL)}>
          Book a Cleaning
        </Button>
      }
    >
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 animate-gradient-shift bg-[linear-gradient(120deg,#ccfbf1,#f0fdfa,#5eead4,#f0fdfa)] bg-[length:300%_300%] opacity-70 dark:opacity-20" />
        <div className="absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-seafoam-300/40 blur-3xl" />
        <Section className="!py-28 text-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-seafoam-700 shadow-sm backdrop-blur dark:bg-slate-800/70 dark:text-seafoam-300">
                <Sparkles className="h-3.5 w-3.5" /> Premium cleaning, on demand
              </span>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-charcoal dark:text-white sm:text-6xl"
            >
              Home cleaning, ordered like your favorite delivery.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300"
            >
              Book a vetted, insured cleaner in under a minute. Track them in
              real time. Come home to spotless.
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Button
                size="lg"
                onClick={() => (window.location.href = CUSTOMER_URL)}
              >
                Book a Cleaning <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => (window.location.href = CLEANER_URL)}
              >
                Become a Cleaner
              </Button>
            </motion.div>
          </motion.div>
        </Section>
      </div>

      {/* How it works */}
      <Section id="how">
        <SectionHeading
          eyebrow="How it works"
          title="Spotless in three taps"
        />
        <motion.div
          className="mt-12 grid gap-6 md:grid-cols-3"
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
              <p className="text-xs font-semibold text-seafoam-600">
                Step {i + 1}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-charcoal dark:text-white">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-slate-500">{s.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Services */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="services">
          <SectionHeading eyebrow="Services" title="A clean for every occasion" />
          <motion.div
            className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
          >
            {services.map((s) => (
              <motion.div
                key={s.name}
                variants={fadeUp}
                className="rounded-2xl border border-slate-200 bg-offwhite p-6 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-charcoal dark:text-white">
                  {s.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{s.desc}</p>
                <p className="mt-4 text-lg font-bold text-charcoal dark:text-white">
                  from {formatCurrency(s.price)}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </Section>
      </div>

      {/* Why Sweepr */}
      <Section id="why">
        <SectionHeading eyebrow="Why Sweepr" title="Trusted from doorstep to done" />
        <motion.div
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {trust.map((t) => (
            <motion.div key={t.title} variants={fadeUp} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                <t.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-charcoal dark:text-white">
                {t.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{t.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Pricing teaser */}
      <div className="bg-white dark:bg-slate-900/40">
        <Section id="pricing">
          <SectionHeading
            eyebrow="Pricing"
            title="Get an instant quote"
            subtitle="Transparent, upfront pricing. Here's what others are paying."
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
                    <td className="px-5 py-3 text-charcoal dark:text-white">
                      {r.home}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{r.service}</td>
                    <td className="px-5 py-3 text-right font-semibold text-charcoal dark:text-white">
                      {formatCurrency(r.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 text-center">
            <Button size="lg" onClick={() => (window.location.href = CUSTOMER_URL)}>
              Get my instant quote <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Section>
      </div>

      {/* FAQ */}
      <Section id="faq">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mx-auto mt-10 max-w-2xl">
          <Accordion items={faqs} />
        </div>
      </Section>

      {/* CTA banner */}
      <Section className="!py-12">
        <div className="rounded-3xl bg-gradient-to-br from-seafoam-500 to-seafoam-600 px-8 py-12 text-center text-white">
          <h2 className="text-3xl font-bold">Ready for a spotless home?</h2>
          <p className="mx-auto mt-2 max-w-md opacity-90">
            Book in under a minute. Cancel anytime.
          </p>
          <div className="mt-6 flex justify-center">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => (window.location.href = CUSTOMER_URL)}
            >
              Book a Cleaning
            </Button>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-seafoam-500 text-sm font-bold text-white">
              S
            </div>
            <span className="font-bold text-charcoal dark:text-white">Sweepr</span>
          </div>
          <nav className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
            <a href="#services" className="hover:text-seafoam-600">Services</a>
            <a href="#pricing" className="hover:text-seafoam-600">Pricing</a>
            <a href={CLEANER_URL} className="hover:text-seafoam-600">Cleaners</a>
            <a href="#faq" className="hover:text-seafoam-600">FAQ</a>
          </nav>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Sweepr, Inc.
          </p>
        </div>
      </footer>
    </MarketingShell>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      className="text-center"
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-seafoam-600">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-bold text-charcoal dark:text-white sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-xl text-slate-500">{subtitle}</p>
      )}
    </motion.div>
  );
}
