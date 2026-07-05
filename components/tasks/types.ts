/** A person reference for name lookups and the assignee picker. */
export interface Person {
  id: string;
  name: string;
  avatarPath?: string | null;
  /**
   * Default note-colour key (see NOTE_COLORS), unique within their department.
   * Used as the note background for their tasks when no custom colour is set, so
   * you can tell whose note is whose at a glance.
   */
  noteColor?: string | null;
}

/** A department reference for pickers, labels, and sticky-note colour. */
export interface DeptRef {
  id: string;
  name: string;
  slug: string;
}
