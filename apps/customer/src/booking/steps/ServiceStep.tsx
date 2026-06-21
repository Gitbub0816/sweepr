import { useNavigate } from "react-router-dom";
import { Home, Sparkles, Truck, Repeat } from "lucide-react";
import { ServiceCard, AddOnGrid } from "@sweepr/ui";
import { ADD_ONS, BASE_PRICES } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const services: {
  type: ServiceType;
  name: string;
  desc: string;
  icon: typeof Home;
  suffix?: string;
}[] = [
  { type: "standard", name: "Standard Clean", desc: "Routine top-to-bottom tidy.", icon: Home },
  { type: "deep", name: "Deep Clean", desc: "Detailed, intensive reset.", icon: Sparkles },
  { type: "move_in_out", name: "Move-in / Move-out", desc: "Empty-home spotless clean.", icon: Truck },
  { type: "recurring", name: "Recurring Clean", desc: "Save with weekly or biweekly.", icon: Repeat, suffix: "/visit" },
];

export function ServiceStep() {
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const setService = useBookingStore((s) => s.setService);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const toggleAddOn = useBookingStore((s) => s.toggleAddOn);

  return (
    <StepShell
      title="Choose your service"
      subtitle="Pick the clean that fits, then add any extras."
      onBack={() => navigate("/book/home")}
      onNext={() => navigate("/book/schedule")}
      nextDisabled={!serviceType}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((s) => (
          <ServiceCard
            key={s.type}
            icon={s.icon}
            name={s.name}
            description={s.desc}
            price={BASE_PRICES[s.type]}
            priceSuffix={s.suffix}
            selected={serviceType === s.type}
            onSelect={() => setService(s.type)}
          />
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-charcoal dark:text-white">
        Add-ons
      </h2>
      <AddOnGrid addOns={ADD_ONS} selected={addOnKeys} onToggle={toggleAddOn} />
    </StepShell>
  );
}
