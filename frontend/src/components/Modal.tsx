/**
 * components/Modal.tsx — หน้าต่างซ้อน (dialog) ทั่วไป: หัวเรื่อง + ปุ่มปิด + เนื้อหาเลื่อนได้ + แถบปุ่มด้านล่าง (ไม่บังด้วยแป้นพิมพ์มือถือ)
 *   <Modal open={open} onClose={() => setOpen(false)} title="ชื่อ" footer={<Button>ตกลง</Button>}>...</Modal>
 * size: sm | md | lg | xl  ·  จอมือถือกว้างเกือบเต็ม  ·  Esc/กดพื้นหลังเพื่อปิด
 */
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

const SIZE = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl' };

type Props = { open: boolean; onClose: () => void; title: ReactNode; description?: string; size?: keyof typeof SIZE; footer?: ReactNode; children: ReactNode };

export function Modal({ open, onClose, title, description, size = 'md', footer, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-card shadow-xl focus:outline-none', SIZE[size])}>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'text-sm text-muted-foreground' : 'sr-only'}>{description ?? 'รายละเอียด'}</Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="ปิด">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
