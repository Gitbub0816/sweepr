import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Lock } from "lucide-react";
import { Input, Button, toast } from "@sweepr/ui";
import { formatCurrency } from "@sweepr/utils";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

export function PaymentStep() {
  const navigate = useNavigate();
  const quote = useBookingStore((s) => s.getQuote());
  const confirmPayment = useBookingStore((s) => s.confirmPayment);
  const [processing, setProcessing] = useState(false);
  const [card, setCard] = useState({ number: "", exp: "", cvc: "", name: "" });

  if (!quote) {
    navigate("/book/service");
    return null;
  }

  const valid =
    card.number.replace(/\s/g, "").length >= 15 &&
    card.exp.length >= 4 &&
    card.cvc.length >= 3 &&
    card.name.trim().length > 1;

  const pay = () => {
    setProcessing(true);
    setTimeout(() => {
      confirmPayment();
      toast.success("Payment confirmed");
      navigate("/book/confirmed");
    }, 1200);
  };

  return (
    <StepShell
      title="Payment"
      subtitle="You won't be charged until your cleaning is confirmed."
      onBack={() => navigate("/book/review")}
    >
      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Lock className="h-4 w-4" /> Secured by Stripe (mock)
        </div>
        <div className="space-y-4">
          <Input
            label="Cardholder name"
            placeholder="Jane Doe"
            value={card.name}
            onChange={(e) => setCard({ ...card, name: e.target.value })}
          />
          <div className="relative">
            <CreditCard className="pointer-events-none absolute left-3.5 top-9 h-4 w-4 text-slate-400" />
            <Input
              className="pl-10"
              label="Card number"
              placeholder="4242 4242 4242 4242"
              value={card.number}
              onChange={(e) => setCard({ ...card, number: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Expiry"
              placeholder="MM/YY"
              value={card.exp}
              onChange={(e) => setCard({ ...card, exp: e.target.value })}
            />
            <Input
              label="CVC"
              placeholder="123"
              value={card.cvc}
              onChange={(e) => setCard({ ...card, cvc: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Button
        className="mt-6"
        fullWidth
        size="lg"
        loading={processing}
        disabled={!valid}
        onClick={pay}
      >
        Pay {formatCurrency(quote.total)}
      </Button>
    </StepShell>
  );
}
