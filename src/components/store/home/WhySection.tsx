import { Section } from "@/components/store/Section";

export function WhySection({
  eyebrow,
  points,
}: {
  eyebrow: string;
  points: readonly { title: string; copy: string }[];
}) {
  return (
    <Section>
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-12 grid gap-px lg:grid-cols-4">
        {points.map((point) => (
          <div key={point.title} className="border-border border-t py-8 pr-6 lg:border-r lg:pl-6">
            <h3 className="font-serif text-2xl">{point.title}</h3>
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{point.copy}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
