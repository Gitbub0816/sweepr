import { CheckCircle2 } from "lucide-react";
import { SweeprLogo } from "@sweepr/ui";

/**
 * Landing page after completing Didit verification via the desktop QR code flow.
 * The phone opens this URL — it just tells the user to return to their desktop tab.
 * The desktop page polls /didit/status and auto-updates when the webhook arrives.
 */
export function VerifyDonePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-50 px-6 text-center dark:bg-slate-950">
      <SweeprLogo className="h-8 w-auto" />

      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-seafoam-100 dark:bg-seafoam-900/30">
          <CheckCircle2 className="h-10 w-10 text-seafoam-600 dark:text-seafoam-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-charcoal dark:text-white">
            Verification submitted
          </h1>
          <p className="max-w-xs text-base text-slate-500 dark:text-slate-400">
            You're all set on this device. Return to your desktop tab to
            continue your application — it will update automatically.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-seafoam-200 bg-seafoam-50 px-5 py-4 dark:border-seafoam-800 dark:bg-seafoam-900/20">
        <span className="text-2xl">💻</span>
        <p className="text-sm font-medium text-seafoam-800 dark:text-seafoam-200">
          You can close this tab on your phone
        </p>
      </div>
    </div>
  );
}
