import { Action } from '../core/game';
import { WAIT } from '../core/types';

export type Command = Action | 'undo' | 'restart' | 'menu' | 'hint' | 'trails' | 'recToggle' | 'mute' | 'preview' | 'previewOn' | 'previewOff';

const KEYS: Record<string, Command> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
  Space: WAIT,
  Period: WAIT,
  KeyE: 'recToggle',
  Enter: 'recToggle',
  Escape: 'cancel',
  KeyZ: 'undo',
  Backspace: 'undo',
  KeyR: 'restart',
  KeyH: 'hint',
  KeyT: 'trails',
  KeyM: 'mute',
  KeyP: 'preview',
};

/** 键盘 + 触屏滑动 + 鼠标拖动。返回解绑函数 */
/** paused() 为真时（比如弹窗开着）不接管键盘，让弹窗自己处理方向键 / 回车 / 空格 */
export function bindInput(target: HTMLElement, onCmd: (c: Command) => void, paused: () => boolean = () => false): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (paused()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.code === 'KeyZ') {
        e.preventDefault();
        onCmd('undo');
      }
      return;
    }
    // 按住 Shift 预演
    if (e.key === 'Shift') {
      if (!e.repeat) onCmd('previewOn');
      return;
    }
    const c = KEYS[e.code];
    if (c === undefined) return;
    e.preventDefault();
    onCmd(c);
  };

  // 触屏滑动或鼠标按住拖动，按位移的主方向走一步
  let sx = 0;
  let sy = 0;
  let st = 0;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (paused()) return;
    // 从按钮、弹窗上开始的手势不算滑动（照常点按钮）
    if (e.target instanceof Element && e.target.closest('button, a, input, textarea, .modal-back')) return;
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
    target.setPointerCapture?.(e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    if (!st) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const dist = Math.hypot(dx, dy);
    st = 0;
    if (dist < (e.pointerType === 'mouse' ? 30 : 24)) return;
    if (Math.abs(dx) > Math.abs(dy)) onCmd(dx > 0 ? 1 : 3);
    else onCmd(dy > 0 ? 2 : 0);
  };

  const onKeyUp = (e: KeyboardEvent) => e.key === 'Shift' && onCmd('previewOff');
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointerup', onUp);
  const onCancel = () => (st = 0);
  target.addEventListener('pointercancel', onCancel);
  return () => {
    target.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointerup', onUp);
  };
}
