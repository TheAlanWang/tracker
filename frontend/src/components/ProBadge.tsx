// Gold "Pro" pill. Two looks:
//   sm — ghost-gold: hairline gold border + gold text, near-transparent
//        tint. Understated; used in the top-bar workspace switcher.
//   md — solid gold fill + white text. Bolder; used in the Settings
//        Plan section where it's the focal "you're on Pro" marker.
export function ProBadge({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  if (size === "md") {
    return (
      <span
        className={
          "inline-flex items-center justify-center rounded-full leading-none " +
          "h-7 px-3.5 text-sm font-semibold uppercase tracking-[0.1em] " +
          "bg-gradient-to-b from-[#D9B23A] to-[#C9A227] text-white " +
          "ring-1 ring-inset ring-[#B8902A]/50 " +
          "shadow-[0_1px_2px_rgba(180,140,20,0.35)] select-none " +
          className
        }
      >
        Pro
      </span>
    );
  }
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded-full leading-none " +
        "h-[18px] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] " +
        "bg-[#C9A227]/8 text-[#A6841C] dark:text-[#E8C766] " +
        "ring-1 ring-inset ring-[#C9A227]/35 select-none " +
        className
      }
    >
      Pro
    </span>
  );
}
