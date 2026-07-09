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
import { Button } from "@sweepr/ui";

export function YardstikSimulatePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8 text-center dark:bg-slate-950">
      <CheckCircle2 className="h-14 w-14 text-seafoam-500" />
      <div>
        <h1 className="text-2xl font-bold text-charcoal dark:text-white">
          Background Check (Demo)
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          In production this iframe loads Yardstik's secure hosted form. In demo
          mode, click below to simulate a completed submission.
        </p>
      </div>
      <Button
        onClick={() => {
          window.parent.postMessage({ type: "yardstik-simulate-complete" }, "*");
        }}
      >
        Simulate completed background check
      </Button>
    </div>
  );
}
