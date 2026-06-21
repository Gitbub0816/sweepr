import { useParams, Link } from "react-router-dom";
import { MapPin, Home, Clock, Navigation } from "lucide-react";
import { DashboardShell, Card, Button, ErrorState } from "@sweepr/ui";
import { SERVICE_LABELS, formatCurrency } from "@sweepr/utils";
import { availableJobs } from "../data/mock";

export function JobDetailPage() {
  const { id } = useParams();
  const job = availableJobs.find((j) => j.id === id);

  if (!job) {
    return (
      <ErrorState
        title="Job not found"
        action={
          <Link to="/jobs">
            <Button variant="secondary">Back to board</Button>
          </Link>
        }
      />
    );
  }

  return (
    <DashboardShell
      title={SERVICE_LABELS[job.serviceType]}
      description={`Job ${job.id}`}
      actions={
        <span className="text-2xl font-bold text-charcoal dark:text-white">
          {formatCurrency(job.pay)}
        </span>
      }
    >
      <Card className="space-y-4">
        <Detail icon={MapPin} label="Area" value={job.area} />
        <Detail icon={Navigation} label="Distance" value={`${job.distanceMi} mi`} />
        <Detail
          icon={Home}
          label="Home"
          value={`${job.bedrooms} bd · ${job.bathrooms} ba · ${job.sqft} sqft`}
        />
        <Detail icon={Clock} label="When" value={`${job.date}, ${job.timeSlot}`} />
      </Card>
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth>
          Pass
        </Button>
        <Button fullWidth>Accept job</Button>
      </div>
    </DashboardShell>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
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
