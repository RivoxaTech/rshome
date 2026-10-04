import "@/lib/zod-config";
import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "./actions";

// The audit viewer's URL query (S20): every filter is optional and a bad value falls back to
// "no filter" rather than a 400, since these only ever come from the page's own links.

const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const AUDIT_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const AUDIT_DEFAULT_PAGE_SIZE: (typeof AUDIT_PAGE_SIZE_OPTIONS)[number] = 25;

const actionKeys = AUDIT_ACTIONS.map((action) => action.key);
const entityKeys = AUDIT_ENTITIES.map((entity) => entity.key);

/** "YYYY-MM-DD" from a `<input type="date">`; anything else is dropped. */
const dateField = z.preprocess(firstQueryValue, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()).catch(undefined);

export const auditListQuerySchema = z.object({
  /** A user id, or "system" for rows with no acting user. */
  user: z.preprocess(firstQueryValue, z.union([z.literal("system"), z.coerce.number().int().min(1)]).optional()).catch(undefined),
  action: z.preprocess(firstQueryValue, z.enum(actionKeys as [string, ...string[]]).optional()).catch(undefined),
  entity: z.preprocess(firstQueryValue, z.enum(entityKeys as [string, ...string[]]).optional()).catch(undefined),
  entityId: z.preprocess(firstQueryValue, z.string().trim().max(50).optional()).catch(undefined),
  from: dateField,
  to: dateField,
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof AUDIT_PAGE_SIZE_OPTIONS)[number] => (AUDIT_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(AUDIT_DEFAULT_PAGE_SIZE),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

/** The filter values as URL parameters, blank ones omitted — what `buildListPath`'s `extra` carries across pagination. */
export function auditFilterParams(query: AuditListQuery): Record<string, string | undefined> {
  return {
    user: query.user === undefined ? undefined : String(query.user),
    action: query.action,
    entity: query.entity,
    entityId: query.entityId || undefined,
    from: query.from,
    to: query.to,
  };
}
