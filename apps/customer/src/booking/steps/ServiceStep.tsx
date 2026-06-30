import { useNavigate } from "react-router-dom";
import { Home, Sparkles, Truck, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ServiceCard, AddOnGrid } from "@sweepr/ui";
import { ADD_ONS, BASE_PRICES } from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

export function ServiceStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const serviceType = useBookingStore((s) => s.serviceType);
  const setService = useBookingStore((s) => s.setService);
  const addOnKeys = useBookingStore((s) => s.addOnKeys);
  const toggleAddOn = useBookingStore((s) => s.toggleAddOn);

  const services: {
    type: ServiceType;
    name: string;
    desc: string;
    icon: typeof Home;
    suffix?: string;
  }[] = [
    { type: "standard", name: t("booking.service.standard"), desc: t("booking.service.standardDesc"), icon: Home },
    { type: "deep", name: t("booking.service.deep"), desc: t("booking.service.deepDesc"), icon: Sparkles },
    { type: "move_in_out", name: t("booking.service.moveInOut"), desc: t("booking.service.moveInOutDesc"), icon: Truck },
    { type: "recurring", name: t("booking.service.recurring"), desc: t("booking.service.recurringDesc"), icon: Repeat, suffix: t("booking.service.perVisit") },
  ];

  return (
    <StepShell
      title={t("booking.service.title")}
      subtitle={t("booking.service.subtitle")}
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
            price={BASE_PRICES[s.type] ?? 0}
            priceSuffix={s.suffix}
            selected={serviceType === s.type}
            onSelect={() => setService(s.type)}
          />
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-charcoal dark:text-white">
        {t("booking.service.addOns")}
      </h2>
      <AddOnGrid addOns={ADD_ONS} selected={addOnKeys} onToggle={toggleAddOn} />
    </StepShell>
  );
}
