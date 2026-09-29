const SIZES = {
  /** The product page's control, as in the demo's product view. */
  default: { button: "px-4 py-3", value: "w-10 text-sm" },
  /** Cart lines: short enough to sit under the name and price inside the thumbnail's height. */
  compact: { button: "px-2.5 py-1.5 text-sm leading-none", value: "w-7 text-xs" },
} as const;

/** The − / n / + control, shared by the product page and the cart. */
export function QuantityStepper({
  value,
  min = 1,
  max,
  disabled = false,
  size = "default",
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  size?: keyof typeof SIZES;
  onChange: (next: number) => void;
}) {
  const classes = SIZES[size];
  return (
    <div className="border-espresso/30 flex items-center border" aria-label="Quantity" role="group">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className={`hover:text-champagne transition-colors disabled:opacity-30 ${classes.button}`}
      >
        −
      </button>
      <span className={`text-center ${classes.value}`} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className={`hover:text-champagne transition-colors disabled:opacity-30 ${classes.button}`}
      >
        +
      </button>
    </div>
  );
}
