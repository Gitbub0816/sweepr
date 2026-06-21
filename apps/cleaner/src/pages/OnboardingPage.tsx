import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Stepper,
  Card,
  Input,
  Button,
  AddOnGrid,
  ThemeToggle,
  toast,
} from "@sweepr/ui";
import type { ServiceType } from "@sweepr/types";
import { SERVICE_LABELS } from "@sweepr/utils";

const STEPS = [
  "Profile",
  "Service Area",
  "Services",
  "Availability",
  "Verification",
];

const SERVICE_OPTIONS = (
  ["standard", "deep", "move_in_out", "recurring"] as ServiceType[]
).map((t) => ({ id: t, key: t, name: SERVICE_LABELS[t], price: 0, createdAt: "", updatedAt: "" }));

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<string[]>(["standard"]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else {
      toast.success("Application submitted!");
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-offwhite px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-500 font-bold text-white">
              S
            </div>
            <span className="font-bold text-charcoal dark:text-white">
              Become a Sweepr Pro
            </span>
          </div>
          <ThemeToggle />
        </div>

        <Stepper steps={STEPS} current={step} className="mb-8" />

        <Card>
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal dark:text-white">
                Your profile
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="First name" placeholder="Alex" />
                <Input label="Last name" placeholder="Lee" />
              </div>
              <Input label="Email" type="email" placeholder="alex@example.com" />
              <Input label="Phone" placeholder="(555) 123-4567" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal dark:text-white">
                Service area
              </h2>
              <p className="text-sm text-slate-500">
                Add the ZIP codes you're willing to travel to.
              </p>
              <Input label="ZIP codes" placeholder="92101, 92103, 92104" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal dark:text-white">
                Services you offer
              </h2>
              <AddOnGrid
                addOns={SERVICE_OPTIONS}
                selected={services}
                onToggle={(k) =>
                  setServices((s) =>
                    s.includes(k) ? s.filter((x) => x !== k) : [...s, k]
                  )
                }
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal dark:text-white">
                Availability
              </h2>
              <p className="text-sm text-slate-500">
                You'll fine-tune your weekly schedule after approval. For now,
                tell us roughly how many hours per week you can work.
              </p>
              <Input
                type="number"
                label="Hours per week"
                defaultValue={20}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-charcoal dark:text-white">
                Verification
              </h2>
              <p className="text-sm text-slate-500">
                We'll run an identity and background check. Upload a government
                ID to get started.
              </p>
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700">
                Drag &amp; drop your ID, or click to upload
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={next}>
              {step === STEPS.length - 1 ? "Submit application" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
