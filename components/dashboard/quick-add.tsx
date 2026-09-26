"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "@/components/icons";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import { createTask } from "@/app/(dashboard)/tasks/actions";
import { createClient } from "@/lib/supabase/client";
import type { UpdateTaskInput } from "@/app/(dashboard)/tasks/actions";
import type { DeptRef, Person } from "@/components/tasks/types";

/**
 * One field, one Enter, task on your list. `createTask` already defaults the
 * assignee to the signed-in person and the department to their first one, so
 * a title is the only thing worth asking for on the fast path.
 *
 * The + beside it opens the same full form the board uses — description,
 * colour, deadline, assignee — carrying whatever has been typed so far. The
 * people and departments that form needs are only fetched when it opens, so
 * the dashboard's own render path stays clear of queries nobody may need.
 *
 * Renders as the top row of the plate card — no box of its own, so the card
 * reads as one surface rather than a frame around another frame.
 *
 * No router.refresh() after creating: `createTask` calls revalidatePath, and
 * a revalidating Server Action already sends the re-rendered dashboard back in
 * its own response. Refreshing on top rendered the whole dashboard twice.
 */
export function QuickAdd({
  me,
  canAssignOthers,
}: {
  me: Person;
  canAssignOthers: boolean;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [options, setOptions] = useState<{
    assignable: Person[];
    departments: DeptRef[];
  } | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createTask({ title: trimmed });
      if (res.ok) {
        setTitle("");
      } else {
        setError(res.error ?? "Could not add that task.");
      }
    });
  }

  // The dialog reads `departments[0]` once on mount, so load before opening
  // rather than letting it mount against an empty list.
  async function openFull() {
    if (opening) return;
    if (options) {
      setOpening(true);
      return;
    }
    setOpening(true);
    setError(null);
    const supabase = createClient();

    const { data: mine } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", me.id);
    const deptIds = (mine ?? []).map((r) => r.department_id as string);

    const { data: depts } = deptIds.length
      ? await supabase
          .from("departments")
          .select("id, name, slug")
          .in("id", deptIds)
          .order("name")
      : { data: [] };

    // Who you may assign to is enforced in `createTask` regardless — this list
    // only decides what is worth showing.
    const { data: people } = canAssignOthers
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, note_color")
          .is("deactivated_at", null)
          .order("full_name", { nullsFirst: false })
      : { data: null };

    setOptions({
      departments: (depts ?? []) as DeptRef[],
      assignable: people
        ? (
            people as {
              id: string;
              full_name: string | null;
              email: string;
              note_color: string | null;
            }[]
          ).map((p) => ({ id: p.id, name: p.full_name || p.email, noteColor: p.note_color }))
        : [me],
    });
  }

  async function create(patch: UpdateTaskInput) {
    const res = await createTask({
      title: patch.title ?? "",
      description: patch.description ?? undefined,
      departmentId: patch.departmentId,
      assignedTo: patch.assignedTo,
      deadline: patch.deadline,
      color: patch.color,
    });
    if (res.ok) {
      setTitle("");
    }
    return res;
  }

  return (
    <>
      <form onSubmit={submit}>
        <div className="flex items-center gap-2 px-4 py-3 transition-colors focus-within:bg-accent/60">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="Add something to your list"
            aria-label="Add a task"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {title.trim() && (
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 touch-manipulation rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add"}
            </button>
          )}
          <button
            type="button"
            onClick={openFull}
            disabled={opening && !options}
            aria-label="Add a task with details"
            title="Description, colour, deadline, who it goes to"
            className="-mr-1 inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>

      {opening && options && (
        <TaskDetailDialog
          editable
          canReassign={canAssignOthers}
          assignable={options.assignable}
          departments={options.departments}
          creatorName={me.name}
          canDelete={false}
          meId={me.id}
          initialTitle={title.trim()}
          onClose={() => setOpening(false)}
          onSave={create}
        />
      )}
    </>
  );
}
