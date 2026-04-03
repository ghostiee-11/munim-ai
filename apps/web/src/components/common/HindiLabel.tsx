import { cn } from "@/lib/utils";

interface HindiLabelProps {
  hindi: string;
  english?: string;
  className?: string;
  hindiClassName?: string;
  englishClassName?: string;
}

/**
 * Bilingual label: shows Hindi text with optional English subtitle.
 */
export function HindiLabel({
  hindi,
  english,
  className,
  hindiClassName,
  englishClassName,
}: HindiLabelProps) {
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span
        className={cn("text-sm font-medium text-munim-text-primary", hindiClassName)}
        lang="hi"
      >
        {hindi}
      </span>
      {english && (
        <span
          className={cn(
            "text-[10px] text-munim-text-secondary",
            englishClassName
          )}
          lang="en"
        >
          {english}
        </span>
      )}
    </span>
  );
}
