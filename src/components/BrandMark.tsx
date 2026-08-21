export function BrandMark({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const width = Math.round(size * 2.35);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink ${className}`}
      style={{ width, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aap-logo.png"
        alt="Aam Aadmi Party"
        className="h-[88%] w-[94%] object-contain"
      />
    </span>
  );
}
