/**
 * Pure helpers for product variants (S10 phase 3a): attribute pairs, the auto-generated label and
 * "same attribute set" detection. No DB access — `variants-staff-service.ts` loads the rows and
 * applies these; `schemas.ts#variantInputSchema` uses `validateAttributePairs` for the form.
 */
import { z } from "zod";

/** product_variants.attributes, e.g. {"Colour":"Red","Size":"Large"} (DATABASE.md DB2). */
export const variantAttributesSchema = z.record(z.string(), z.string());

/** Key/value pairs a variant can carry (Colour, Size, …); the dialog offers this many rows. */
export const MAX_VARIANT_ATTRIBUTES = 5;

/** Offered as one-click names on an empty attribute row; any other name is allowed too. */
export const SUGGESTED_ATTRIBUTE_NAMES = ["Colour", "Size"] as const;

export const ATTRIBUTE_SLOTS = Array.from({ length: MAX_VARIANT_ATTRIBUTES }, (_, index) => index);

export type AttributePair = { key: string; value: string };
export type AttributePairError = { index: number; field: "key" | "value"; message: string };

/**
 * Trims every pair, skips a fully empty row, and refuses a half-filled row, a duplicate name
 * (case-insensitive) or more than `MAX_VARIANT_ATTRIBUTES` pairs. Returns the clean attribute
 * object alongside the errors so a form can show every problem at once.
 */
export function validateAttributePairs(pairs: AttributePair[]): { attributes: Record<string, string>; errors: AttributePairError[] } {
  const attributes: Record<string, string> = {};
  const errors: AttributePairError[] = [];
  const seen = new Set<string>();

  pairs.forEach((pair, index) => {
    const key = pair.key.trim();
    const value = pair.value.trim();
    if (!key && !value) return;
    if (index >= MAX_VARIANT_ATTRIBUTES) {
      errors.push({ index, field: "key", message: `Up to ${MAX_VARIANT_ATTRIBUTES} attributes per variant.` });
      return;
    }
    if (!key) {
      errors.push({ index, field: "key", message: "Enter an attribute name." });
      return;
    }
    if (seen.has(key.toLowerCase())) {
      errors.push({ index, field: "key", message: "Each attribute name can only be used once." });
      return;
    }
    seen.add(key.toLowerCase());
    if (!value) {
      errors.push({ index, field: "value", message: "Enter a value." });
      return;
    }
    attributes[key] = value;
  });

  return { attributes, errors };
}

/** "Red / Large" from the attribute values in their given order; "Default" when there are none. */
export function generateVariantLabel(attributes: Record<string, string>): string {
  const values = Object.values(attributes).map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values.join(" / ") : "Default";
}

/** A canonical form of an attribute set: order- and case-insensitive, so {Size: L, Colour: Red} equals {colour: red, size: l}. */
export function attributesKey(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key.trim().toLowerCase()}=${value.trim().toLowerCase()}`)
    .sort()
    .join("|");
}

export function sameAttributes(a: Record<string, string>, b: Record<string, string>): boolean {
  return attributesKey(a) === attributesKey(b);
}

/** `product_variants.attributes` (JSON text) as an object; anything unreadable counts as no attributes. */
export function parseVariantAttributes(raw: string): Record<string, string> {
  try {
    return variantAttributesSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}
