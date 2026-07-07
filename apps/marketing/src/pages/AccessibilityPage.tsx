/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Accessibility statement — public commitment to WCAG 2.2 AA conformance
 * with a working feedback channel, as recommended by W3C and referenced by
 * ADA Title III guidance.
 */
import { useSeo } from "../lib/useSeo";

export default function AccessibilityPage() {
  useSeo({ title: 'Accessibility statement — Sweepr', description: "Sweepr's commitment to WCAG 2.2 AA accessibility conformance, and how to report accessibility issues.", canonical: "https://getsweepr.com/accessibility" });
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-charcoal">Accessibility statement</h1>

      <section aria-labelledby="a11y-commitment" className="mt-8">
        <h2 id="a11y-commitment" className="text-xl font-semibold text-charcoal">Our commitment</h2>
        <p className="mt-2 text-slate-600">
          Sweepr is committed to ensuring digital accessibility for people with
          disabilities. We aim to conform to the Web Content Accessibility
          Guidelines (WCAG) 2.2, Level AA, across getsweepr.com and the Sweepr
          customer and cleaner applications, and we continually improve the
          experience for everyone.
        </p>
      </section>

      <section aria-labelledby="a11y-measures" className="mt-8">
        <h2 id="a11y-measures" className="text-xl font-semibold text-charcoal">Measures we take</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-600">
          <li>Automated accessibility testing (axe-core) against every public page</li>
          <li>Keyboard operability, visible focus indicators, and skip-to-content links</li>
          <li>Screen-reader labels on all controls and programmatic error messaging on forms</li>
          <li>Color contrast meeting or exceeding the 4.5:1 requirement for text</li>
          <li>Respect for reduced-motion preferences</li>
        </ul>
      </section>

      <section aria-labelledby="a11y-feedback" className="mt-8">
        <h2 id="a11y-feedback" className="text-xl font-semibold text-charcoal">Feedback</h2>
        <p className="mt-2 text-slate-600">
          If you encounter an accessibility barrier anywhere on Sweepr, please
          tell us — we take every report seriously and aim to respond within
          two business days. Email{" "}
          <a href="mailto:help@getsweepr.com" className="text-seafoam-700 underline">
            help@getsweepr.com
          </a>{" "}
          with "Accessibility" in the subject line, and include the page and
          the assistive technology you were using.
        </p>
      </section>

      <p className="mt-10 text-sm text-slate-500">Last reviewed: July 2026.</p>
    </main>
  );
}
