/**
 * A payment screenshot, opening full size in a new tab. The file is private and authenticated
 * (PAY-03), and next/image's loader only serves /media, so it is a plain <img>.
 */
export function ProofImage({ proofId, alt, className = "max-h-[35dvh]" }: { proofId: number; alt: string; className?: string }) {
  const src = `/api/files/proof/${proofId}`;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-muted border-border relative block overflow-hidden rounded-lg border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`mx-auto w-auto object-contain ${className}`} />
      <span className="absolute top-2 right-2 rounded-md bg-black/65 px-2 py-1 text-xs font-medium text-white">Open full size</span>
    </a>
  );
}
