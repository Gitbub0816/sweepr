import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import { DashboardShell, Card, Badge, Input, Textarea, Button, toast } from "@sweepr/ui";

export function ProfilePage() {
  return (
    <DashboardShell title="Profile" description="Manage your cleaner profile.">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-seafoam-500 text-xl font-bold text-white">
              AL
            </div>
            <div>
              <p className="font-semibold text-charcoal dark:text-white">
                Alex Lee
              </p>
              <p className="flex items-center gap-1 text-sm text-slate-500">
                <Star className="h-3.5 w-3.5 fill-amberaccent text-amberaccent" />
                4.9 · 24 jobs
              </p>
            </div>
          </div>
          <Input label="Display name" defaultValue="Alex Lee" />
          <Textarea
            label="Bio"
            defaultValue="Detail-oriented cleaner with 5 years of experience. Pet-friendly."
          />
          <Button onClick={() => toast.success("Profile saved")}>
            Save changes
          </Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold text-charcoal dark:text-white">
            Verification status
          </h2>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <BadgeCheck className="h-4 w-4 text-emerald-500" /> Identity
            </span>
            <Badge variant="success">Verified</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Background check
            </span>
            <Badge variant="success">Passed</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-500">
              Insurance
            </span>
            <Badge variant="warning">Pending</Badge>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
