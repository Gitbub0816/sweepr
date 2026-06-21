import { DashboardShell, Card, Input, Button, toast } from "@sweepr/ui";

export function SettingsPage() {
  return (
    <DashboardShell title="Settings" description="Platform-wide configuration.">
      <Card className="max-w-lg space-y-4">
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">
          General
        </h2>
        <Input label="Platform name" defaultValue="Sweepr" />
        <Input label="Support email" defaultValue="support@sweep-r.com" />
        <Input label="Service fee (%)" type="number" defaultValue={10} />
        <Input label="Tax rate (%)" type="number" defaultValue={8.25} />
        <Button onClick={() => toast.success("Settings saved")}>
          Save settings
        </Button>
      </Card>
    </DashboardShell>
  );
}
