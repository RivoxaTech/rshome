"use client";

/**
 * An on/off switch, backed by a hidden `name`/"true"-"false" form field so a parent `<form>` can
 * submit its state like any other field. The knob is explicitly left-anchored (`left-0.5`) rather
 * than relying on an absolutely-positioned element's "static position" fallback, which isn't
 * reliable enough across engines to place the knob correctly in both states (found when this
 * first shipped only inside `CategoryForm.tsx`: the knob sat at the same spot, overhanging the
 * track, in both states).
 */
export function Switch({ name, checked, onChange }: { name: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <>
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`focus-visible:ring-ring relative h-[22px] w-10 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>
    </>
  );
}
