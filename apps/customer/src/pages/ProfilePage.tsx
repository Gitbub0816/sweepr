import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";

export function ProfilePage() {
  return (
    <DashboardShell title="Profile" description="Manage your account details.">
      <Card className="max-w-lg space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-seafoam-500 text-xl font-bold text-white">
            JD
          </div>
          <div>
            <p className="font-semibold text-charcoal dark:text-white">
              Jane Doe
            </p>
            <p className="text-sm text-slate-500">jane@example.com</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" defaultValue="Jane" />
          <Input label="Last name" defaultValue="Doe" />
        </div>
        <Input label="Email" type="email" defaultValue="jane@example.com" />
        <Input label="Phone" defaultValue="(555) 123-4567" />
        <Button onClick={() => toast.success("Profile saved")}>
          Save changes
        </Button>
      </Card>
    </DashboardShell>
  );
}
