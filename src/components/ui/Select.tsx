import type { SelectHTMLAttributes } from 'react';

type SelectSize = 'sm' | 'md';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  selectSize?: SelectSize;
};

export function Select({ selectSize = 'md', className, ...props }: SelectProps) {
  const classes = ['ui-select', `ui-select--${selectSize}`, className].filter(Boolean).join(' ');
  return <select {...props} className={classes} />;
}
