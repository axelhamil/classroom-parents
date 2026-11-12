import type { LucideIcon } from "lucide-react";

interface SwapIconOption<T extends string> {
  value: T;
  icon: LucideIcon;
}

interface SwapIconProps<T extends string> {
  value: T;
  options: readonly SwapIconOption<T>[];
}

function SwapIcon<T extends string>({ value, options }: SwapIconProps<T>) {
  return (
    <span data-slot="swap-icon" aria-hidden>
      {options.map(({ value: option, icon: Icon }) => (
        <Icon key={option} data-active={option === value} />
      ))}
    </span>
  );
}

export { SwapIcon, type SwapIconOption };
