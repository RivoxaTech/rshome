import { db } from "@/server/db/client";
import { wholesaleInquiries, wholesaleInquiryItems } from "@/server/db/schema/wholesale";
import type { WholesaleInquiryInput } from "./schemas";

/** One transaction: the inquiry row, then its item rows. */
export async function createInquiry(input: Omit<WholesaleInquiryInput, "website">): Promise<number> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [result] = await tx.insert(wholesaleInquiries).values({
      name: input.name,
      business: input.business,
      businessType: input.businessType,
      phone: input.phone,
      email: input.email,
      city: input.city,
      neededByDate: input.neededByDate ? new Date(input.neededByDate) : null,
      message: input.message,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(wholesaleInquiryItems).values(
      input.items.map((item) => ({
        inquiryId: result.insertId,
        itemName: item.itemName,
        quantity: item.quantity,
        note: item.note,
      })),
    );
    return result.insertId;
  });
}
