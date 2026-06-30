import { getUserAccess } from "@/lib/auth";
import { TasksTabs } from "@/components/tasks-tabs";

/**
 * Shared chrome for Tasks & Reporting: the sub-navigation tabs. The "Manage"
 * tab is shown only to admins + HR & Management. Each page still enforces its
 * own access — the tabs are just navigation.
 */
export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getUserAccess();

  return (
    <>
      <TasksTabs canManage={Boolean(access?.canManageUsers)} />
      {children}
    </>
  );
}
