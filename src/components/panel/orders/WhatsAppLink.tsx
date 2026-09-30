import { WhatsAppGlyph, whatsAppHref } from "@/components/store/WhatsAppButton";

/** Shop to customer on WhatsApp, with the message for the order's stage (C13). */
export function WhatsAppLink({ phone, message }: { phone: string; message: string }) {
  return (
    <a
      href={whatsAppHref(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-whatsapp inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 sm:h-9 sm:text-[13px] [&>svg]:size-[18px]"
    >
      <WhatsAppGlyph />
      WhatsApp customer
    </a>
  );
}
