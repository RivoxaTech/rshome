import { siteConfig } from "@/config/site.config";

// Placeholder so the S3 store shell (announcement bar, header, footer) is visible end to end.
// The real home page (hero, collections, featured products) is built in S4.
export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col items-start px-6 pt-40 pb-32 lg:px-10 lg:pt-48">
      <p className="eyebrow">{siteConfig.logoText} &bull; Karachi</p>
      <h1 className="mt-6 font-serif text-4xl tracking-tight lg:text-6xl">Elevate Everyday Living</h1>
      <p className="text-muted-foreground mt-6 max-w-md text-sm leading-relaxed">
        The home page (hero, collections, featured products) arrives in slice S4. This placeholder
        confirms the announcement bar, header and footer shell.
      </p>
    </div>
  );
}
