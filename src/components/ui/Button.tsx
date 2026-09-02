import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'surface' | 'primary' | 'ghost' | 'danger' | 'plain';
type ButtonSize = 'sm' | 'md' | 'icon' | 'auto';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  variant = 'surface',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classNames('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
    />
  );
}

export function IconButton({
  label,
  title = label,
  children,
  ...props
}: Omit<ButtonProps, 'aria-label' | 'title'> & {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Button {...props} size="icon" aria-label={label} title={title}>
      {children}
    </Button>
  );
}
