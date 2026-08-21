export function BrandMark({
  size = 56,
  className = "",
  tone = "onLight",
}: {
  size?: number;
  className?: string;
  /** onDark = white broom (dark headers); onLight = dark broom (white cards) */
  tone?: "onDark" | "onLight";
}) {
  const width = Math.round(size * 2.35);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aap-logo.png"
        alt="Aam Aadmi Party"
        className={`h-full w-full object-contain ${tone === "onLight" ? "brightness-0" : ""}`}
      />
    </span>
  );
}
