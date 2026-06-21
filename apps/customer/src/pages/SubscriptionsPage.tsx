import { useState } from "react";
import { Link } from "react-router-dom";
import { Repeat, Pause, Play, SkipForward, X, Sparkles } from "lucide-react";
import { Card, Button, Badge, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";

interface SubCard {
  id: string;
  serviceType: string;
  cadence: "weekly" | "biweekly" | "monthly";
  nextDate: string;
  pricePerVisit: number; // dollars
  status: "active" | "paused";
}

const MOCK: SubCard[] = [
  {
    id: "sub_1",
    serviceType: "Standard Clean",
    cadence: "weekly",
    nextDate: "2026-06-28",
    pricePerVisit: 143,
    status: "active",
  },
  {
    id: "sub_2",
    serviceType: "Deep Clean",
    cadence: "monthly",
    nextDate: "2026-07-10",
    pricePerVisit: 219,
    status: "paused",
  },
];

const CADENCE_LABEL = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
} as const;

export function SubscriptionsPage() {
  const [subs, setSubs] = useState<SubCard[]>(MOCK);

  const update = (id: string, status: "active" | "paused") => {
    setSubs((s) => s.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  if (subs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-seafoam-400" />
        <h1 className="mt-4 text-xl font-bold text-charcoal dark:text-white">
          No subscriptions yet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Set up a recurring clean and save on every visit.
        </p>
        <Link to="/book" className="mt-6 inline-block">
          <Button>Book a recurring clean</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-charcoal dark:text-white">
        Subscriptions
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your recurring cleans.
      </p>

      <div className="mt-6 space-y-4">
        {subs.map((sub) => (
          <Card key={sub.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
                  <Repeat className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-charcoal dark:text-white">
                    {sub.serviceType}
                  </p>
                  <p className="text-sm text-slate-500">
                    {CADENCE_LABEL[sub.cadence]} ·{" "}
                    {formatCurrency(sub.pricePerVisit)}/visit
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Next cleaning:{" "}
                    {new Date(sub.nextDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <Badge
                variant={sub.status === "active" ? "success" : "default"}
              >
                {sub.status === "active" ? "Active" : "Paused"}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {sub.status === "active" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    update(sub.id, "paused");
                    toast.success("Subscription paused");
                  }}
                >
                  <Pause className="mr-1 h-4 w-4" /> Pause
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    update(sub.id, "active");
                    toast.success("Subscription resumed");
                  }}
                >
                  <Play className="mr-1 h-4 w-4" /> Resume
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => toast.success("Next cleaning skipped")}
              >
                <SkipForward className="mr-1 h-4 w-4" /> Skip next
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSubs((s) => s.filter((x) => x.id !== sub.id));
                  toast.success("Subscription cancelled");
                }}
              >
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
