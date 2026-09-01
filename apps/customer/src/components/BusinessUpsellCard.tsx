/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Link } from "react-router";
import { Card } from "@sweepr/ui";
import { Briefcase, ChevronRight } from "lucide-react";

/**
 * Settings entry point for Sweepr Business — links to the /business
 * conversion flow (team access, multiple properties, consolidated billing).
 */
export function BusinessUpsellCard() {
  return (
    <Link to="/business" className="block">
      <Card className="flex items-center gap-4 transition hover:border-seafoam-500 dark:hover:border-seafoam-500">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-seafoam-700 text-white">
          <Briefcase className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            Sweepr for Business
          </p>
          <p className="text-sm text-slate-500">
            Manage multiple properties, invite your team, and consolidate billing.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </Card>
    </Link>
  );
}
