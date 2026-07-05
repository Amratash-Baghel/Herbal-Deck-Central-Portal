/** A person reference for name lookups and the assignee picker. */
export interface Person {
  id: string;
  name: string;
  avatarPath?: string | null;
  /** Default accent colour (hex) for the whose-task dot. */
  color?: string | null;
}

/** A department reference for pickers, labels, and sticky-note colour. */
export interface DeptRef {
  id: string;
  name: string;
  slug: string;
}
