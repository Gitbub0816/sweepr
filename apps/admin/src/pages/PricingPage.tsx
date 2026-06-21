import { useState } from "react";
import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";
import {
  BASE_PRICES,
  PER_BEDROOM,
  PER_BATHROOM,
  LARGE_HOME_SURCHARGE,
  ADD_ONS,
  SERVICE_LABELS,
} from "@sweepr/utils";
import type { ServiceType } from "@sweepr/types";

export function PricingPage() {
  const [base, setBase] = useState(BASE_PRICES);
  const [perBed, setPerBed] = useState(PER_BEDROOM);
  const [perBath, setPerBath] = useState(PER_BATHROOM);
  const [largeHome, setLargeHome] = useState(LARGE_HOME_SURCHARGE);

  return (
    <DashboardShell
      title="Pricing Rules"
      description="Edit base prices, surcharges and add-ons."
      actions={
        <Button onClick={() => toast.success("Pricing rules saved")}>
          Save rules
        </Button>
      }
    >
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">
          Base prices
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(base) as ServiceType[]).map((t) => (
            <Input
              key={t}
              type="number"
              label={SERVICE_LABELS[t]}
              value={base[t]}
              onChange={(e) =>
                setBase({ ...base, [t]: Number(e.target.value) })
              }
            />
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">
          Surcharges
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            type="number"
            label="Per bedroom"
            value={perBed}
            onChange={(e) => setPerBed(Number(e.target.value))}
          />
          <Input
            type="number"
            label="Per bathroom"
            value={perBath}
            onChange={(e) => setPerBath(Number(e.target.value))}
          />
          <Input
            type="number"
            label="Large home (>2000 sqft)"
            value={largeHome}
            onChange={(e) => setLargeHome(Number(e.target.value))}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">
          Add-ons
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADD_ONS.map((a) => (
            <Input
              key={a.key}
              type="number"
              label={a.name}
              defaultValue={a.price}
            />
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
