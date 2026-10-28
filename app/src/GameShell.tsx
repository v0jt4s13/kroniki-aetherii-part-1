import { createContext, forwardRef, useContext, type ComponentProps, type PropsWithChildren } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BottomSheet, KeyboardInput, KeyboardTextarea, KeyboardProvider, MobileScroll, useKeyboard } from './mobile';
import { MobileDeviceProvider } from './mobile/Device';

const NativeContext = createContext(false);
export function NativeGameShell({ children }: PropsWithChildren) {
  return <NativeContext.Provider value={true}><MobileDeviceProvider><KeyboardProvider>{children}</KeyboardProvider></MobileDeviceProvider></NativeContext.Provider>;
}
export function GameScroll(props: ComponentProps<typeof MobileScroll>) {
  const native = useContext(NativeContext);
  if (!native) return <MobileScroll {...props}/>;
  return <div className={`native-scroll ${props.className || ''}`}>{props.children}</div>;
}
export const GameInput = forwardRef<HTMLInputElement, ComponentProps<typeof KeyboardInput>>((props, ref) => {
  const native = useContext(NativeContext);
  return native ? <input {...props} ref={ref}/> : <KeyboardInput {...props} ref={ref}/>;
});
export function GameTextarea(props: ComponentProps<typeof KeyboardTextarea>) {
  const native = useContext(NativeContext);
  return native ? <textarea {...props}/> : <KeyboardTextarea {...props}/>;
}
export function useGameKeyboard() { return useKeyboard(); }
export function GameSheet(props: ComponentProps<typeof BottomSheet>) {
  const native = useContext(NativeContext);
  if (!native) return <BottomSheet {...props}/>;
  return <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}><Dialog.Portal><Dialog.Overlay className="native-sheet-overlay"/><Dialog.Content className="native-sheet" aria-describedby={undefined}><div className="native-sheet-heading"><Dialog.Title className="sheet-title">{props.title}</Dialog.Title></div><div className="native-sheet-content">{props.children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
