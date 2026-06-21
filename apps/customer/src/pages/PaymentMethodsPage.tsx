import { CreditCard, Plus } from "lucide-react";
import { DashboardShell, Card, Badge, Button, toast } from "@sweepr/ui";
import { mockPaymentMethods } from "../data/mock";

export function PaymentMethodsPage() {
  return (
    <DashboardShell
      title="Payment Methods"
      description="Manage your saved cards."
      actions={
        <Button onClick={() => toast.success("Add card flow (mock)")}>
          <Plus className="h-4 w-4" /> Add card
        </Button>
      }
    >
      <div className="space-y-3">
        {mockPaymentMethods.map((pm) => (
          <Card key={pm.id} className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600 dark:bg-slate-800">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-charcoal dark:text-white">
                {pm.brand} ···· {pm.last4}
              </p>
              <p className="text-sm text-slate-500">
                Expires {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
              </p>
            </div>
            {pm.isDefault && <Badge variant="success">Default</Badge>}
          </Card>
        ))}
      </div>
    </DashboardShell>
  );
}
