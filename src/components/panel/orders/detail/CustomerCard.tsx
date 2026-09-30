import { DetailCard } from "@/components/panel/orders/detail/DetailCard";
import { WhatsAppButton, whatsAppHref } from "@/components/store/WhatsAppButton";
import type { StaffOrderView } from "@/features/orders/staff-service";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function CustomerCard({
  customer,
  address,
  customerNote,
  whatsApp,
}: {
  customer: StaffOrderView["customer"];
  address: StaffOrderView["address"];
  customerNote: string | null;
  whatsApp: StaffOrderView["whatsApp"];
}) {
  return (
    <DetailCard title="Customer">
      <div className="flex items-center gap-3">
        <span className="bg-secondary text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {initials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{customer.name}</p>
          <p className="text-muted-foreground truncate text-xs">{customer.phone}</p>
        </div>
      </div>

      <WhatsAppButton href={whatsAppHref(customer.phoneDigits, whatsApp.message)} label="WhatsApp customer" variant="full" />

      <div className="border-border flex flex-col gap-1 border-t pt-3 text-sm">
        <p className="text-muted-foreground text-xs">Contact</p>
        <p>{customer.phone}</p>
        {customer.email && <p>{customer.email}</p>}
      </div>

      <div className="border-border flex flex-col gap-1 border-t pt-3 text-sm">
        <p className="text-muted-foreground text-xs">Shipping address</p>
        {address.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>

      {customerNote && (
        <div className="border-border flex flex-col gap-1 border-t pt-3 text-sm">
          <p className="text-muted-foreground text-xs">Customer note</p>
          <p>{customerNote}</p>
        </div>
      )}
    </DetailCard>
  );
}
