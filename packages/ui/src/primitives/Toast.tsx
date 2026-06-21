import { Toaster, toast } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className:
          "rounded-xl border border-slate-200 dark:border-slate-700",
      }}
    />
  );
}

export { toast };
