/**
 * components/Popup.tsx — ป๊อปอัปกลางของทั้งระบบ (สำเร็จ / ผิดพลาด / เตือน / ถามยืนยัน)
 *
 *   const popup = usePopup();
 *   popup.success('บันทึกข้อมูลสำเร็จ');
 *   popup.error(res.message);
 *   if (await popup.confirm({ message: 'ต้องการลบ?', danger: true })) { ...ทำต่อ... }
 */
import * as Dialog from '@radix-ui/react-dialog';
import { keepFloating } from '../lib/floating';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { MSG } from '../lib/messages';
import { Button } from './Button';

type Kind = 'success' | 'error' | 'warn' | 'confirm';
type State = { kind: Kind; title: string; message: string; danger?: boolean; confirmText?: string } | null;
type ConfirmOptions = { title?: string; message: string; danger?: boolean; confirmText?: string };

type PopupApi = {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warn: (message: string, title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const PopupContext = createContext<PopupApi | null>(null);

const ICON = {
  success: <CircleCheck className="size-10 text-success-ink" />,
  error: <CircleAlert className="size-10 text-danger" />,
  warn: <TriangleAlert className="size-10 text-warn-ink" />,
  confirm: <TriangleAlert className="size-10 text-warn-ink" />,
};

export function PopupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  const api = useMemo<PopupApi>(
    () => ({
      success: (message, title = MSG.success) => setState({ kind: 'success', title, message }),
      error: (message, title = MSG.error) => setState({ kind: 'error', title, message }),
      warn: (message, title = 'แจ้งเตือน') => setState({ kind: 'warn', title, message }),
      confirm: ({ title = 'ยืนยัน', message, danger, confirmText }) =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setState({ kind: 'confirm', title, message, danger, confirmText });
        }),
    }),
    [],
  );

  return (
    <PopupContext.Provider value={api}>
      {children}
      <Dialog.Root open={!!state} onOpenChange={(open) => !open && close(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content onInteractOutside={keepFloating} className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 text-center shadow-xl">
            {state && (
              <>
                <div className="mb-3 flex justify-center">{ICON[state.kind]}</div>
                <Dialog.Title className="text-lg font-semibold">{state.title}</Dialog.Title>
                <Dialog.Description className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{state.message}</Dialog.Description>
                <div className="mt-5 flex justify-center gap-2">
                  {state.kind === 'confirm' ? (
                    <>
                      <Button variant="outline" onClick={() => close(false)}>
                        {MSG.cancel}
                      </Button>
                      <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                        {state.confirmText ?? MSG.confirm}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => close(true)}>ตกลง</Button>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PopupContext.Provider>
  );
}

export function usePopup(): PopupApi {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error('usePopup ต้องใช้ภายใน <PopupProvider>');
  return ctx;
}
