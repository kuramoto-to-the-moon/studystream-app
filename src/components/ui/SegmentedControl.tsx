import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';

export function SegmentedControl({
  label,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  const classes = ['ui-segmented-control', className].filter(Boolean).join(' ');
  return (
    <div {...props} className={classes} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function SegmentedOption({
  selected,
  onSelect,
  className,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  const classes = ['ui-segmented-option', selected && 'active', className].filter(Boolean).join(' ');
  return (
    <Button
      variant="plain"
      size="auto"
      className={classes}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {children}
    </Button>
  );
}
