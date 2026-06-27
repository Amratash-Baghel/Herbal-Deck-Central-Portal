import { getUserAccess } from "@/lib/auth";
import { BillingTabs } from "@/components/billing-tabs";

/**
 * Shared chrome for the billing section: the sub-navigation tabs. The "Clear"
 * tab is shown only to billing managers. Each page still enforces its own
 * access — the tabs are just navigation.
 */
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getUserAccess();

  return (
    <>
      <BillingTabs canClear={Boolean(access?.canManageBilling)} />
      {children}
    </>
  );
}
