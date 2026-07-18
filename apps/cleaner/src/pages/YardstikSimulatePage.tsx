/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { CheckCircle2 } from "lucide-react";

// Mock stand-in for Yardstik's hosted background-check form, embedded via
// iframe during local/demo runs (real production traffic never reaches this
// route). It intentionally does nothing but render — there is no listener
// anywhere in the app for a completion message, so a "simulate complete"
// button here would be dead: it would post into the void. If a real
// completion signal is ever wired up (a `message` listener on the parent
// window, keyed off `event.origin`), reintroduce a button that fires it here.
export function YardstikSimulatePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8 text-center dark:bg-slate-950">
      <CheckCircle2 className="h-14 w-14 text-seafoam-500" />
      <div>
        <h1 className="text-2xl font-bold text-charcoal dark:text-white">
          Background Check (Demo)
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          In production this iframe loads Yardstik's secure hosted form.
        </p>
      </div>
    </div>
  );
}
