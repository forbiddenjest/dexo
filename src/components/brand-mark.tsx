import azureLogo from "@/assets/azure-logo.png.asset.json";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const BOX: Record<Size, string> = {
  sm: "size-7",
  md: "size-9",
  lg: "size-12",
};

const TITLE: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

export function BrandMark({
  size = "sm",
  subtitle,
  title = "Azure",
  className,
}: {
  size?: Size;
  subtitle?: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={azureLogo.url}
        alt="Azure logo"
        className={cn("shrink-0 object-contain", BOX[size])}
      />
      <div className="min-w-0">
        <div
          className={cn("metal-text font-semibold tracking-tight whitespace-nowrap", TITLE[size])}
        >
          {title}
        </div>
        {subtitle && <div className="text-xs tracking-wide text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}
