import type { ReactNode } from "react";
import { Card } from "@sweepr/ui";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
}: {
  columns: Column<T>[];
  rows: T[];
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-offwhite text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={`px-4 py-3 font-medium ${
                  c.align === "right" ? "text-right" : ""
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`px-4 py-3 text-charcoal dark:text-slate-200 ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
