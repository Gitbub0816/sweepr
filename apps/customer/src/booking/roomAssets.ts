/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { RoomConditionLevel, RoomType } from "@sweepr/types";

/**
 * Room-condition selection metadata for the Clean My Home flow.
 *
 * Images live in apps/customer/public/rooms/{roomType}_{level}.webp and are
 * shown as selectable cards. Deliberately NO price anywhere here — the customer
 * never sees pricing while choosing conditions (only the final owed at review).
 */

export const ROOM_TYPES: { type: RoomType; label: string }[] = [
  { type: "kitchen", label: "Kitchen" },
  { type: "bathroom", label: "Bathroom" },
  { type: "bedroom", label: "Bedroom" },
  { type: "living_room", label: "Living room" },
];

export const CONDITION_LEVELS: RoomConditionLevel[] = [
  "level_1",
  "level_2",
  "level_3",
  "level_4",
];

/** Short, non-judgmental caption per level so the customer can self-select. */
export const LEVEL_CAPTIONS: Record<RoomConditionLevel, string> = {
  level_1: "Lightly used, mostly tidy",
  level_2: "Everyday mess, normal wear",
  level_3: "Needs attention, built-up grime",
  level_4: "Heavy, lots of attention needed",
};

export function roomImage(type: RoomType, level: RoomConditionLevel): string {
  const n = level.replace("level_", "");
  return `/rooms/${type}_level_${n}.webp`;
}

/**
 * Bridge the room-condition selections to the server's cleaning-level pricing
 * model (worst room drives the level). Replaced by the full room-condition
 * pricing engine once admin config lands.
 */
export function deriveCleaningLevel(
  rooms: { level: RoomConditionLevel }[],
): "refresh" | "extra_attention" | "significant_attention" {
  const worst = rooms.reduce((max, r) => {
    const n = Number(r.level.replace("level_", ""));
    return n > max ? n : max;
  }, 1);
  if (worst >= 4) return "significant_attention";
  if (worst >= 3) return "extra_attention";
  return "refresh";
}

export const MULTI_ROOM_HELPER =
  "If you have more than one room of a type, choose the condition of the one needing the most attention. We will use your other answers and room count to estimate the remaining rooms fairly.";

/** Clutter/access states (Pricing v2): helps reserve enough time, nothing
 *  more. Copy is deliberately judgment-free. */
export const CLUTTER_STATES: Array<{ value: 0 | 1 | 2; label: string; hint: string }> = [
  { value: 0, label: "Clear", hint: "Floors and surfaces are easy to reach" },
  { value: 1, label: "Some items to work around", hint: "A few things to move or clean around" },
  { value: 2, label: "Quite full", hint: "Many surfaces or floor areas are hard to reach" },
];
