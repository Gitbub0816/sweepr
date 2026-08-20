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
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@sweepr/utils";
import type { RoomConditionLevel, RoomType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import {
  ROOM_TYPES,
  CONDITION_LEVELS,
  CLUTTER_STATES,
  LEVEL_CAPTIONS,
  MULTI_ROOM_HELPER,
  roomImage,
} from "../roomAssets";
import {
  SELECTABLE_OPTION_BASE,
  SELECTABLE_OPTION_SELECTED,
  SELECTABLE_OPTION_UNSELECTED,
} from "../../lib/selectableOption";

/**
 * Room-by-room visual condition selection. The customer picks the image that
 * best matches the WORST room of each type. No pricing is shown here — the
 * final owed amount appears only at the Review step.
 */
export function RoomConditionStep() {
  const navigate = useNavigate();
  const rooms = useBookingStore((s) => s.rooms);
  const setRoomCondition = useBookingStore((s) => s.setRoomCondition);
  const clutter = useBookingStore((s) => s.clutter);
  const setClutter = useBookingStore((s) => s.setClutter);
  const home = useBookingStore((s) => s.home);

  const selectedFor = (type: RoomType): RoomConditionLevel | undefined =>
    rooms.find((r) => r.roomType === type)?.level;

  const allSelected = ROOM_TYPES.every((r) => selectedFor(r.type));

  /** How many rooms of a type this home has (mirrors server-side counting). */
  const countFor = (type: RoomType): number => {
    if (type === "bedroom") return Math.max(1, home.bedrooms);
    if (type === "bathroom") return Math.max(1, Math.ceil(home.bathrooms));
    return 1;
  };

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

              {/* Clutter/access — separate from dirtiness; only reserves time. */}
              <div className="mt-3">
                <p className="mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                  How easy is it to reach the surfaces in{" "}
                  {countFor(room.type) > 1 ? "these rooms" : "this room"}? Everyday
                  belongings are completely normal, this just helps us reserve enough time.
                </p>
                <div role="radiogroup" aria-label={`${room.label} access`} className="flex flex-wrap gap-2">
                  {CLUTTER_STATES.map((state) => {
                    const current = clutter[room.type] ?? 0;
                    return (
                      <button
                        key={state.value}
                        type="button"
                        role="radio"
                        aria-checked={current === state.value}
                        title={state.hint}
                        onClick={() => setClutter(room.type, state.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          current === state.value
                            ? "border-seafoam-500 bg-seafoam-50 font-medium text-seafoam-800 dark:bg-seafoam-900/30 dark:text-seafoam-200"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300",
                        )}
                      >
                        {state.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {countFor(room.type) > 1 && (
                <VaryALotEditor
                  roomType={room.type}
                  roomLabel={room.label}
                  count={countFor(room.type)}
                  reportedMax={selected}
                />
              )}
            </fieldset>
          );
        })}
      </div>
    </StepShell>
  );
}

/**
 * Optional correction path: exact room counts per condition level for a
 * multi-room type. Entirely optional — when the counts don't add up we simply
 * don't store them (inference handles the type as usual). Never blocks Next.
 */
function VaryALotEditor({
  roomType,
  roomLabel,
  count,
  reportedMax,
}: {
  roomType: RoomType;
  roomLabel: string;
  count: number;
  reportedMax: RoomConditionLevel | undefined;
}) {
  const stored = useBookingStore((s) => s.roomCountsByLevel[roomType]);
  const setRoomCountsByLevel = useBookingStore((s) => s.setRoomCountsByLevel);
  const [open, setOpen] = useState(Boolean(stored));
  const [draft, setDraft] = useState<[number, number, number, number]>(
    stored ?? [0, 0, 0, 0],
  );

  if (!reportedMax) return null;
  const maxIndex = CONDITION_LEVELS.indexOf(reportedMax);
  const sum = draft[0] + draft[1] + draft[2] + draft[3];
  const valid = sum === count && draft[maxIndex] >= 1;

  const update = (i: number, next: number): void => {
    const nextDraft = [...draft] as [number, number, number, number];
    nextDraft[i] = Math.max(0, Math.min(count, next));
    setDraft(nextDraft);
    const total = nextDraft[0] + nextDraft[1] + nextDraft[2] + nextDraft[3];
    setRoomCountsByLevel(
      roomType,
      total === count && nextDraft[maxIndex] >= 1 ? nextDraft : null,
    );
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) setRoomCountsByLevel(roomType, null);
        }}
        className="text-sm font-medium text-seafoam-700 underline-offset-4 hover:underline dark:text-seafoam-400"
      >
        {open ? "Never mind, estimate for me" : `My ${roomLabel.toLowerCase()}s vary a lot`}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Optional: tell us exactly how many of your {count} {roomLabel.toLowerCase()}s
            match each photo. At least one should match the photo you picked above.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CONDITION_LEVELS.map((level, i) => (
              <label key={level} className="block">
                <span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">
                  {LEVEL_CAPTIONS[level]}
                </span>
                <input
                  type="number"
                  min={0}
                  max={i > maxIndex ? 0 : count}
                  disabled={i > maxIndex}
                  value={draft[i]}
                  onChange={(e) => update(i, Number.parseInt(e.target.value || "0", 10))}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                />
              </label>
            ))}
          </div>
          <p
            className={cn(
              "mt-2 text-xs",
              valid ? "text-seafoam-700 dark:text-seafoam-400" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {valid
              ? "Great, we'll use these exact counts."
              : `Counts should add up to ${count} (currently ${sum}). Until then we'll estimate for you.`}
          </p>
        </div>
      )}
    </div>
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
        SELECTABLE_OPTION_BASE,
        "group relative overflow-hidden rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400",
        selected ? SELECTABLE_OPTION_SELECTED : SELECTABLE_OPTION_UNSELECTED,
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
        <AnimatePresence>
          {selected && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-seafoam-600 text-white shadow motion-reduce:transition-none"
            >
              <Check className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="px-2 py-2 text-xs text-slate-600 dark:text-slate-300">{caption}</p>
    </button>
  );
}
