import { useEffect, useState } from "react";
import { MapPin, Navigation, Home, Clock, CheckCircle2 } from "lucide-react";
import { Card, Button } from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency, cn } from "@sweepr/utils";
import type { AvailableJob } from "../data/mock";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function JobCard({
  job,
  accepted,
  onAccept,
  onPass,
  onExpire,
  expiresInSec = 300,
}: {
  job: AvailableJob;
  accepted?: boolean;
  onAccept: () => void;
  onPass: () => void;
  onExpire?: () => void;
  expiresInSec?: number;
}) {
  const [remaining, setRemaining] = useState(expiresInSec);
  const expired = remaining <= 0;

  useEffect(() => {
    if (accepted) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          onExpire?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted]);

  if (accepted) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 border-seafoam-400 bg-seafoam-50 text-center dark:bg-seafoam-900/20">
        <CheckCircle2 className="h-10 w-10 text-seafoam-500" />
        <p className="text-base font-semibold text-seafoam-700 dark:text-seafoam-300">
          Accepted
        </p>
        <p className="text-xs text-slate-500">Opening job details…</p>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-4", expired && "opacity-60")}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-seafoam-600">
            {SERVICE_LABELS[job.serviceType]}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-4 w-4" /> {job.area}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-charcoal dark:text-white">
            {formatCurrency(job.pay)}
          </p>
          <p className="text-xs text-slate-400">est. pay (80%)</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-offwhite p-3 text-center text-xs dark:bg-slate-800">
        <div>
          <Navigation className="mx-auto mb-1 h-4 w-4 text-slate-400" />
          <span className="font-medium text-charcoal dark:text-white">
            {job.distanceMi} mi
          </span>
        </div>
        <div>
          <Home className="mx-auto mb-1 h-4 w-4 text-slate-400" />
          <span className="font-medium text-charcoal dark:text-white">
            {job.bedrooms}bd · {job.bathrooms}ba
          </span>
        </div>
        <div>
          <Clock className="mx-auto mb-1 h-4 w-4 text-slate-400" />
          <span className="font-medium text-charcoal dark:text-white">
            {job.date} {job.timeSlot}
          </span>
        </div>
      </div>

      {expired ? (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-red-500">Offer expired</span>
          <Button variant="ghost" size="sm" onClick={onPass}>
            Dismiss
          </Button>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "text-center text-xs font-medium",
              remaining <= 30 ? "text-red-500" : "text-slate-400"
            )}
          >
            Offer expires in {fmt(remaining)}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={onPass}>
              Pass
            </Button>
            <Button fullWidth onClick={onAccept}>
              Accept
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
