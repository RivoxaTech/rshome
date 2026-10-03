import { Skeleton } from "@/components/panel/Skeleton";

/** A form-shaped placeholder for the settings pages' `loading.tsx` (cold navigation). */
export function SettingsFormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <div className="bg-card border-border flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="mt-2 h-9 w-32" />
      </div>
    </div>
  );
}
