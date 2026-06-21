import { Repeat, X } from "lucide-react";
import type { CalendarSlot } from "./types";
import { SLOT_COLORS } from "./types";

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "p" : "a";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ampm}` : `${hr}${ampm}`;
}

export function SlotChip({
  slot,
  onDelete,
  compact,
}: {
  slot: CalendarSlot;
  onDelete?: (slotId: string) => void;
  compact?: boolean;
}) {
  const color = SLOT_COLORS[slot.type];
  const range =
    slot.type === "available_now"
      ? "Now"
      : `${fmt(slot.startTime)}–${fmt(slot.endTime)}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight ${color} ${
        compact ? "max-w-full truncate" : ""
      }`}
    >
      {slot.type === "recurring" && <Repeat className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{slot.label ?? range}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(slot.id);
          }}
          className="ml-0.5 rounded-full hover:bg-black/10"
          aria-label="Remove slot"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
