/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { ShieldCheck, User } from "lucide-react";
import { Card, Badge, FoundingMemberBadge } from "@sweepr/ui";
import type { BookingCrew, CrewSeatView, RevealedCleaner } from "../data/bookings";
import { assignedSeats } from "../data/bookings";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** "Both members…" / "All three members…" — count is the authorized crew. */
function verifiedLine(count: number): string {
  if (count <= 1) return "Your team lead is a verified Sweepr cleaner.";
  if (count === 2) return "Both members of your cleaning team are verified Sweepr cleaners.";
  const word = NUMBER_WORDS[count] ?? String(count);
  return `All ${word} members of your cleaning team are verified Sweepr cleaners.`;
}

function roleLabel(role: CrewSeatView["role"]): string {
  return role === "LEAD" ? "Team lead" : "Team member";
}

/**
 * "Your Sweepr team" roster for a team-staffed booking. Renders only the
 * authorized (assigned) seats returned by GET /bookings/:id/crew, so a person
 * who has not accepted never appears. The LEAD's "First L." name comes from the
 * existing booking-level reveal (revealedCleaner); member names are not exposed
 * customer-safe today, so they show as verified Sweepr cleaners. Rating and
 * cleans-count render only when the backend later supplies them per member.
 */
export function CrewTeamCard({
  crew,
  revealedLead,
}: {
  crew: BookingCrew;
  revealedLead?: RevealedCleaner | null;
}) {
  const seats = assignedSeats(crew);
  if (seats.length === 0) return null;

  const target = crew.targetCrewSize ?? crew.requiredCrewSize ?? seats.length;
  const stillForming = target > seats.length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">
            Your Sweepr team
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {verifiedLine(seats.length)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-seafoam-50 px-3 py-1 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Background-checked
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {seats.map((seat) => {
          const isLead = seat.role === "LEAD";
          const name = isLead ? revealedLead?.displayName : undefined;
          const initial = name?.charAt(0).toUpperCase();
          return (
            <li key={seat.id} className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-seafoam-100 text-lg font-semibold text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                {initial ?? <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
                  {name ?? "Verified Sweepr cleaner"}
                  {isLead && revealedLead?.foundingMember && (
                    <FoundingMemberBadge
                      founderId={revealedLead.foundingMemberId}
                      showTooltip={false}
                    />
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel(seat.role)}</p>
              </div>
              <Badge variant="info">Verified</Badge>
            </li>
          );
        })}
      </ul>

      {stillForming && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          We're still confirming the rest of your team. You'll see everyone here before they arrive.
        </p>
      )}
    </Card>
  );
}
