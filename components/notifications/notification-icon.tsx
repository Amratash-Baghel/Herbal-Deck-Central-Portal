import type { SVGProps } from "react";
import { AtIcon, BillingIcon, ChatIcon, GroupIcon, TasksIcon } from "@/components/icons";
import type { NotificationType } from "@/lib/types";

/**
 * Renders the glyph for a notification type. Declared at module scope (rather
 * than picking a component during render) so React keeps it stable.
 */
export function NotificationTypeIcon({
  type,
  ...props
}: { type: NotificationType } & SVGProps<SVGSVGElement>) {
  switch (type) {
    case "mention":
      return <AtIcon {...props} />;
    case "invoice_posted":
      return <BillingIcon {...props} />;
    case "group_added":
      return <GroupIcon {...props} />;
    case "task_assigned":
      return <TasksIcon {...props} />;
    default:
      return <ChatIcon {...props} />;
  }
}
