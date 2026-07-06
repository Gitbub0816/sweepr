import { useEffect, useState } from "react";
import { Select } from "@sweepr/ui";

export interface ResponseTemplate {
  id: string;
  department: string;
  key: string;
  name: string;
  classification: string | null;
  subject: string | null;
  body: string;
  is_active: boolean;
}

export function fillPlaceholders(
  body: string,
  vars: { case_code?: string | null; ticket_id?: string | null; classification?: string | null; sender_email?: string | null }
): string {
  return body
    .replace(/\{\{?\s*case_code\s*\}?\}/gi, vars.case_code ?? "")
    .replace(/\{\{?\s*ticket_id\s*\}?\}/gi, vars.ticket_id ?? "")
    .replace(/\{\{?\s*classification\s*\}?\}/gi, vars.classification ?? "")
    .replace(/\{\{?\s*sender_email\s*\}?\}/gi, vars.sender_email ?? "");
}

/** Response-template dropdown reused as the source of "Email reporter" body content. */
export function useResponseTemplates(authed: (path: string) => Promise<Response>, department: "it" | "security") {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await authed(`/admin/response-templates?department=${department}`);
      if (res.ok) setTemplates(((await res.json()) as { templates: ResponseTemplate[] }).templates ?? []);
    })();
  }, [authed, department]);
  return templates;
}

export function TemplatePicker({
  templates,
  onSelect,
  label = "Insert template…",
  className,
}: {
  templates: ResponseTemplate[];
  onSelect: (t: ResponseTemplate) => void;
  label?: string;
  className?: string;
}) {
  const usable = templates.filter((t) => t.is_active);
  if (usable.length === 0) return null;
  return (
    <div className={className ?? "w-56"}>
      <Select
        aria-label="Insert response template"
        options={[{ value: "", label }, ...usable.map((t) => ({ value: t.id, label: t.name }))]}
        value=""
        onChange={(e) => {
          const tpl = usable.find((t) => t.id === e.target.value);
          if (tpl) onSelect(tpl);
        }}
      />
    </div>
  );
}
