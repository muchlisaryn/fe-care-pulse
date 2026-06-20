import { cn } from "@/lib/utils";
import { useEffect, useRef, type ComponentProps } from "react";

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  indeterminate?: boolean;
};

export function Checkbox({
  className,
  indeterminate,
  ...props
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-gray-300 text-[#075489] outline-none transition-colors",
        "accent-[#075489] focus:ring-2 focus:ring-[#075489]/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

