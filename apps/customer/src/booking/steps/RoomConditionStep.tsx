/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@sweepr/utils";
import type { RoomConditionLevel, RoomType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import {
  ROOM_TYPES,
  CONDITION_LEVELS,
  LEVEL_CAPTIONS,
  MULTI_ROOM_HELPER,
  roomImage,
} from "../roomAssets";

/**
 * Room-by-room visual condition selection. The customer picks the image that
 * best matches the WORST room of each type. No pricing is shown here — the
 * final owed amount appears only at the Review step.
 */
export function RoomConditionStep() {
  const navigate = useNavigate();
  const rooms = useBookingStore((s) => s.rooms);
  const setRoomCondition = useBookingStore((s) => s.setRoomCondition);

  const selectedFor = (type: RoomType): RoomConditionLevel | undefined =>
    rooms.find((r) => r.roomType === type)?.level;

  const allSelected = ROOM_TYPES.every((r) => selectedFor(r.type));

  return (
    <StepShell
      title="How do your rooms look?"
      subtitle="Pick the photo that best matches each room. This helps us bring the right time and supplies, you won't be charged for extra time on the day."
      onBack={() => navigate("/book/home")}
      onNext={() => navigate("/book/addons")}
      nextDisabled={!allSelected}
    >
      <p className="-mt-2 mb-6 rounded-xl bg-seafoam-50 px-4 py-3 text-sm text-seafoam-800 dark:bg-seafoam-900/20 dark:text-seafoam-200">
        {MULTI_ROOM_HELPER}
      </p>

      <div className="space-y-8">
        {ROOM_TYPES.map((room) => {
          const selected = selectedFor(room.type);
          return (
            <fieldset key={room.type}>
              <legend className="mb-3 text-base font-semibold text-charcoal dark:text-white">
                {room.label}
              </legend>
              <div role="radiogroup" aria-label={`${room.label} condition`} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CONDITION_LEVELS.map((level) => (
                  <ConditionCard
                    key={level}
                    label={room.label}
                    src={roomImage(room.type, level)}
                    caption={LEVEL_CAPTIONS[level]}
                    selected={selected === level}
                    onSelect={() => setRoomCondition(room.type, level)}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </StepShell>
  );
}

function ConditionCard({
  label,
  src,
  caption,
  selected,
  onSelect,
}: {
  label: string;
  src: string;
  caption: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${label}: ${caption}`}
      onClick={onSelect}
      className={cn(
        "group relative overflow-hidden rounded-2xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400",
        selected
          ? "border-seafoam-500 ring-2 ring-seafoam-400"
          : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700",
      )}
    >
      <div className="relative aspect-[3/2] w-full bg-slate-100 dark:bg-slate-800">
        {/* Neutral placeholder shows until the webp decodes. */}
        {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />}
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-seafoam-600 text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="px-2 py-2 text-xs text-slate-600 dark:text-slate-300">{caption}</p>
    </button>
  );
}
