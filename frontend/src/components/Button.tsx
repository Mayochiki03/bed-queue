import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border border-border bg-card text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:opacity-90',
        ghost: 'text-muted-foreground hover:bg-muted',
      },
      size: { md: '', sm: 'px-3 py-1.5 text-xs' },
      full: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean };

/** ปุ่มกลาง: <Button>บันทึก</Button>  <Button variant="outline">ยกเลิก</Button>  variant: primary | outline | danger | ghost */
export function Button({ variant, size, full, loading, className, children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={cn(button({ variant, size, full }), className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
