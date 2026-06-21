import * as RadixAccordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export interface AccordionItemData {
  question: string;
  answer: string;
}

export function Accordion({ items }: { items: AccordionItemData[] }) {
  return (
    <RadixAccordion.Root type="single" collapsible className="space-y-3">
      {items.map((item, i) => (
        <RadixAccordion.Item
          key={i}
          value={`item-${i}`}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        >
          <RadixAccordion.Header>
            <RadixAccordion.Trigger className="group flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-charcoal dark:text-white">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
            </RadixAccordion.Trigger>
          </RadixAccordion.Header>
          <RadixAccordion.Content className="px-5 pb-4 text-sm text-slate-500">
            {item.answer}
          </RadixAccordion.Content>
        </RadixAccordion.Item>
      ))}
    </RadixAccordion.Root>
  );
}
