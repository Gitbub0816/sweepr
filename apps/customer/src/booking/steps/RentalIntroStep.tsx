/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useNavigate } from "react-router";
import { CalendarClock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@sweepr/ui";

/**
 * Short-term rental intro. Turnovers are driven by a synced calendar rather than
 * a one-off booking, so this routes hosts to the rental management area (calendar
 * connect + property setup) instead of the room-condition flow.
 */
export function RentalIntroStep() {
  const navigate = useNavigate();
  return (
    <div>
      <h1 className="text-2xl font-bold text-charcoal dark:text-white">
        Short-term rental turnovers
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect your booking calendar and we'll schedule a turnaround clean after each
        guest checks out, automatically.
      </p>

      <ul className="mt-6 space-y-4">
        {[
          {
            icon: CalendarClock,
            title: "Sync your calendar",
            body: "Paste the iCal link from Airbnb, Vrbo, Booking.com, Google Calendar, or your PMS.",
          },
          {
            icon: RefreshCw,
            title: "Automatic turnovers",
            body: "Each checkout becomes a cleaning. Review them first, or let us auto-book.",
          },
          {
            icon: ShieldCheck,
            title: "Simple monthly subscription",
            body: "A low monthly fee per enrolled property plus a flat turnaround fee per clean, you see both before you enroll, and nothing books without your say-so.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/30">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-charcoal dark:text-white">{title}</p>
              <p className="text-sm text-slate-500">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/book/start")}>
          Back
        </Button>
        <Button onClick={() => navigate("/rentals")}>Connect a calendar</Button>
      </div>
    </div>
  );
}
