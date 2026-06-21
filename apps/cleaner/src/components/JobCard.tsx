import { MapPin, Navigation, Home, Clock } from "lucide-react";
import { Card, Button } from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency } from "@sweepr/utils";
import type { AvailableJob } from "../data/mock";

export function JobCard({
  job,
  onAccept,
  onPass,
}: {
  job: AvailableJob;
  onAccept: () => void;
  onPass: () => void;
}) {
  return (
    <Card className="space-y-4">
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
          <p className="text-xs text-slate-400">est. pay</p>
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
            {job.timeSlot}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        {job.date} · {job.sqft} sqft
      </p>

      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onPass}>
          Pass
        </Button>
        <Button fullWidth onClick={onAccept}>
          Accept
        </Button>
      </div>
    </Card>
  );
}
