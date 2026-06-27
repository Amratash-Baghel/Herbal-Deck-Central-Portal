"use client";

import { useMemo, useState } from "react";
import {
  deactivateEmployee,
  reactivateEmployee,
} from "@/app/(dashboard)/employees/actions";
import { EditUserDepartments } from "@/components/edit-user-departments";
import { SearchIcon, UserMinusIcon } from "@/components/icons";
import type { Department, Role } from "@/lib/types";

export interface EmployeeRow {
  id: string;
  fullName: string | null;
  email: string;
  role: Role;
  departmentIds: string[];
  deactivated: boolean;
}

function initials(name: string | null, email: string): string {
  return (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Searchable employee roster. Active employees show their role, departments, an
 * inline department editor, and a Remove (deactivate) control; removed
 * employees collapse into a separate section with Restore. Removal is gated:
 * never yourself, and only admins can remove another admin — re-checked on the
 * server too.
 */
export function EmployeeList({
  employees,
  departments,
  currentUserId,
  isAdmin,
}: {
  employees: EmployeeRow[];
  departments: Department[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const depts = e.departmentIds
        .map((id) => deptName.get(id) ?? "")
        .join(" ");
      return `${e.fullName ?? ""} ${e.email} ${depts}`
        .toLowerCase()
        .includes(q);
    });
  }, [employees, query, deptName]);

  const active = filtered.filter((e) => !e.deactivated);
  const removed = filtered.filter((e) => e.deactivated);

  function canRemove(e: EmployeeRow): boolean {
    if (e.id === currentUserId) return false;
    return isAdmin || e.role !== "admin";
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Team members
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {active.length} active
              {removed.length > 0 && ` · ${removed.length} removed`}
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or department…"
            className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ul className="divide-y">
        {active.map((e) => {
          const depts = e.departmentIds
            .map((id) => ({ id, name: deptName.get(id) }))
            .filter((d): d is { id: string; name: string } => Boolean(d.name));
          return (
            <li key={e.id} className="px-6 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {initials(e.fullName, e.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {e.fullName || "—"}
                    </span>
                    {e.id === currentUserId && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        You
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        e.role === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.role}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.email}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {depts.length > 0 ? (
                      depts.map((d) => (
                        <span
                          key={d.id}
                          className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {d.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No department
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <EditUserDepartments
                      userId={e.id}
                      departments={departments}
                      selectedIds={e.departmentIds}
                    />
                    {canRemove(e) && (
                      <form action={deactivateEmployee}>
                        <input type="hidden" name="user_id" value={e.id} />
                        <button
                          type="submit"
                          onClick={(ev) => {
                            if (
                              !confirm(
                                `Remove ${e.fullName || e.email}? This revokes their access. Their records are kept and you can restore them later.`,
                              )
                            ) {
                              ev.preventDefault();
                            }
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-red-600"
                        >
                          <UserMinusIcon className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}

        {active.length === 0 && (
          <li className="px-6 py-8 text-sm text-muted-foreground">
            No employees match “{query}”.
          </li>
        )}
      </ul>

      {removed.length > 0 && (
        <div className="border-t">
          <p className="px-6 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Removed
          </p>
          <ul className="divide-y">
            {removed.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-muted-foreground">
                    {e.fullName || e.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.email}
                  </p>
                </div>
                <form action={reactivateEmployee}>
                  <input type="hidden" name="user_id" value={e.id} />
                  <button
                    type="submit"
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
