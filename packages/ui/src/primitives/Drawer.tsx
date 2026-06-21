import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@sweepr/utils";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  side?: "left" | "right" | "bottom";
  children?: ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  side = "right",
  children,
  className,
}: DrawerProps) {
  const sideClasses: Record<NonNullable<DrawerProps["side"]>, string> = {
    right: "right-0 top-0 h-full w-[88vw] max-w-sm",
    left: "left-0 top-0 h-full w-[88vw] max-w-sm",
    bottom: "bottom-0 left-0 w-full max-h-[85vh] rounded-t-2xl",
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed z-50 overflow-y-auto bg-white p-6 shadow-xl focus:outline-none dark:bg-slate-900",
            sideClasses[side],
            className
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            {title && (
              <Dialog.Title className="text-lg font-semibold text-charcoal dark:text-white">
                {title}
              </Dialog.Title>
            )}
            <Dialog.Close className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
