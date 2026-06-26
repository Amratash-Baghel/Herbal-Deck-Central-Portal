"use client";

import type { Department } from "@/lib/types";

/**
 * A multi-select list of departments rendered as checkboxes. Uncontrolled:
 * the checked boxes submit as repeated form fields (default name
 * "department_ids"), read on the server with formData.getAll(name).
 */
export function DepartmentCheckboxes({
  departments,
  selectedIds = [],
  name = "department_ids",
}: {
  departments: Department[];
  selectedIds?: string[];
  name?: string;
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {departments.map((d) => (
        <label
          key={d.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition hover:bg-accent"
        >
          <input
            type="checkbox"
            name={name}
            value={d.id}
            defaultChecked={selectedIds.includes(d.id)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          {d.name}
        </label>
      ))}
    </fieldset>
  );
}
