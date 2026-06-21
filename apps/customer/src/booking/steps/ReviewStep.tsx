import { useNavigate } from "react-router-dom";
import { MapPin, Home, CalendarClock, Sparkles } from "lucide-react";
import { Card, Textarea } from "@sweepr/ui";
import {
  SERVICE_LABELS,
  formatDateTime,
  getAddOn,
} from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-charcoal dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

export function ReviewStep() {
  const navigate = useNavigate();
  const state = useBookingStore();
  const { address, home, serviceType, addOnKeys, scheduledFor, notes } = state;

  if (!address || !serviceType || !scheduledFor) {
    navigate("/book/address");
    return null;
  }

  return (
    <StepShell
      title="Review your booking"
      subtitle="Make sure everything looks right before payment."
      onBack={() => navigate("/book/schedule")}
      onNext={() => navigate("/book/payment")}
      nextLabel="Continue to payment"
    >
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row
          icon={MapPin}
          label="Address"
          value={`${address.line1}, ${address.city}, ${address.state} ${address.zip}`}
        />
        <Row
          icon={Home}
          label="Home"
          value={`${home.bedrooms} bd · ${home.bathrooms} ba · ${home.sqft} sqft · ${home.homeType}`}
        />
        <Row
          icon={Sparkles}
          label="Service"
          value={SERVICE_LABELS[serviceType]}
        />
        <Row
          icon={CalendarClock}
          label="Scheduled for"
          value={formatDateTime(scheduledFor)}
        />
        {addOnKeys.length > 0 && (
          <div className="py-2">
            <p className="text-xs text-slate-400">Add-ons</p>
            <p className="text-sm font-medium text-charcoal dark:text-white">
              {addOnKeys.map((k) => getAddOn(k)?.name).join(", ")}
            </p>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Textarea
          label="Notes for your cleaner (optional)"
          placeholder="Gate code, parking, pets, areas to focus on…"
          value={notes}
          onChange={(e) => state.setNotes(e.target.value)}
        />
      </div>
    </StepShell>
  );
}
