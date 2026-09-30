export function DetailCard({
  title,
  action,
  className = "",
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  /** Extra classes, e.g. to highlight a card that needs staff's attention (S9). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card border-border flex flex-col gap-3 rounded-lg border p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
