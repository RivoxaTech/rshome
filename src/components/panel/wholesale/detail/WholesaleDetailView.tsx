"use client";

import Link from "next/link";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusMenu } from "@/components/panel/wholesale/StatusMenu";
import { ActivityCard } from "@/components/panel/wholesale/detail/ActivityCard";
import { ContactCard } from "@/components/panel/wholesale/detail/ContactCard";
import { InquiryCard } from "@/components/panel/wholesale/detail/InquiryCard";
import { ItemsCard } from "@/components/panel/wholesale/detail/ItemsCard";
import { WholesaleStatusActions } from "@/components/panel/wholesale/detail/WholesaleStatusActions";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import type { StaffWholesaleInquiryView } from "@/features/wholesale/staff-service";

export function WholesaleDetailView({ inquiry, backHref }: { inquiry: StaffWholesaleInquiryView; backHref: string }) {
  return (
    <>
      <PanelPageTitle title={`Wholesale inquiries / ${inquiry.name}`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={backHref}
            aria-label="Back to the wholesale inbox"
            className="text-muted-foreground hover:bg-secondary hover:text-foreground -ml-1.5 shrink-0 rounded-md p-1.5"
          >
            <Icon d={ICON_PATHS.chevronLeft} className="h-4 w-4" />
          </Link>
          <h1 className="text-base font-semibold">{inquiry.name}</h1>
          <StatusMenu id={inquiry.id} control={inquiry.control} />
          <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
            <Icon d={ICON_PATHS.calendar} className="h-3.5 w-3.5" />
            Submitted {inquiry.placedAt}
          </span>
        </div>
        {/* On phones this is its own row (date, then the actions on the right); from `sm` the
            wrapper disappears (`display: contents`) and both children rejoin the row above —
            same trick the order detail page uses. */}
        <div className="flex w-full items-center justify-between gap-3 sm:contents">
          <p className="text-muted-foreground text-xs sm:hidden">Submitted {inquiry.placedAt}</p>
          <WholesaleStatusActions id={inquiry.id} control={inquiry.control} />
        </div>
      </div>

      {/*
        Two column groups, not three grid rows: Contact and Activity live together in ONE wrapper
        that is `display: contents` on phones (so its children stack individually, orderable) and
        a real flex column at `lg` (so they sit flush against each other with just their own
        `gap-4`). Putting them in separate grid ROWS instead (as the first version did) made the
        grid's row 1 as tall as the left column (Inquiry + Items, which grows with the item count),
        and — because the Contact card's own cell then stretched to fill that tall row — left a
        blank gap between Contact and Activity that grew with the item count. Order classes give
        the phone sequence (Contact, then Inquiry/Items, then Activity last) independently of this
        desktop grouping.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
        <div className="order-2 flex flex-col gap-4 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <InquiryCard inquiry={inquiry} />
          <ItemsCard items={inquiry.items} />
        </div>

        <div className="contents lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
          <div className="order-1 lg:order-none">
            <ContactCard customer={inquiry.customer} city={inquiry.city} whatsApp={inquiry.whatsApp} />
          </div>
          <div className="order-3 lg:order-none">
            <ActivityCard id={inquiry.id} activity={inquiry.activity} canAddNote={inquiry.canAddNote} />
          </div>
        </div>
      </div>
    </>
  );
}
