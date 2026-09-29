import Form from "next/form";
import Link from "next/link";
import { listingHref, type ListingState } from "@/components/store/catalog/listing-href";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

const CHIP =
  "shrink-0 whitespace-nowrap border px-4 py-2 text-[10px] tracking-[0.28em] uppercase transition-colors duration-500";
const CHIP_ACTIVE = "bg-espresso border-espresso text-background";
const CHIP_IDLE = "border-espresso/30 hover:border-espresso hover:bg-espresso/5";

/** Name search: a plain GET form, so it works before hydration and keeps the chosen category and sort. */
export function SearchForm({ basePath, state }: { basePath: string; state: ListingState }) {
  return (
    <Form action={basePath} role="search" className="border-espresso/30 focus-within:border-espresso flex max-w-md items-center border-b">
      {state.category && <input type="hidden" name="category" value={state.category} />}
      {state.sort !== "newest" && <input type="hidden" name="sort" value={state.sort} />}
      <input
        type="search"
        name="q"
        defaultValue={state.q}
        maxLength={100}
        placeholder="Search products"
        aria-label="Search products by name"
        className="placeholder:text-muted-foreground w-full bg-transparent py-3 text-sm outline-none"
      />
      <button type="submit" aria-label="Search" className="hover:text-champagne p-2 transition-colors">
        <Icon d={ICON_PATHS.search} />
      </button>
    </Form>
  );
}

/**
 * "All" plus one chip per category; choosing one resets to page 1 and keeps the search and sort.
 * Phones get one sideways-scrolling row (bleeding to the screen edge), wider screens wrap.
 */
export function CategoryChips({
  basePath,
  state,
  categories,
}: {
  basePath: string;
  state: ListingState;
  categories: { slug: string; name: string }[];
}) {
  const chips = [{ slug: undefined, name: "All" }, ...categories];
  return (
    <nav
      aria-label="Categories"
      className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {chips.map((chip) => {
        const active = chip.slug === state.category;
        return (
          <Link
            key={chip.slug ?? "all"}
            href={listingHref(basePath, { ...state, category: chip.slug, page: 1 })}
            aria-current={active ? "page" : undefined}
            className={`${CHIP} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {chip.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({
  basePath,
  state,
  totalPages,
}: {
  basePath: string;
  state: ListingState;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const linkClass = "border-b border-espresso/30 py-2 hover:border-champagne hover:text-champagne transition-colors";
  return (
    <nav
      aria-label="Pagination"
      className="mt-16 flex items-center justify-center gap-8 text-[10px] tracking-[0.28em] uppercase"
    >
      {state.page > 1 ? (
        <Link href={listingHref(basePath, { ...state, page: state.page - 1 })} rel="prev" className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span className="text-muted-foreground/50 py-2">← Previous</span>
      )}
      <span className="text-muted-foreground">
        Page {state.page} of {totalPages}
      </span>
      {state.page < totalPages ? (
        <Link href={listingHref(basePath, { ...state, page: state.page + 1 })} rel="next" className={linkClass}>
          Next →
        </Link>
      ) : (
        <span className="text-muted-foreground/50 py-2">Next →</span>
      )}
    </nav>
  );
}
