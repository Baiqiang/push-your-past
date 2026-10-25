// 秘籍：上上下下左右左右 B A（魂斗罗 30 条命）。输对了解锁提示。
//   电脑：键盘照按，任何界面都行（游戏里按方向键会照常走，撤销回去就好）。
//   手机：在标题页或选关页上依次滑出 上上下下左右左右，再点两下，代替 B A。

type Sym = 'U' | 'D' | 'L' | 'R' | 'B' | 'A';
const CODE: Sym[] = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R', 'B', 'A'];
const TOUCH_CODE: Sym[] = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R', 'A', 'A'];

const KEY_SYM: Record<string, Sym> = {
  ArrowUp: 'U',
  ArrowDown: 'D',
  ArrowLeft: 'L',
  ArrowRight: 'R',
  KeyB: 'B',
  KeyA: 'A',
};

/** 记最近输入的若干个符号，末尾和秘籍对上就触发 */
class Matcher {
  private buf: Sym[] = [];
  constructor(private code: Sym[], private onMatch: () => void) {}
  push(s: Sym): void {
    this.buf.push(s);
    if (this.buf.length > this.code.length) this.buf.shift();
    if (this.buf.length === this.code.length && this.buf.every((x, i) => x === this.code[i])) {
      this.buf = [];
      this.onMatch();
    }
  }
  reset(): void {
    this.buf = [];
  }
}

/**
 * 绑定秘籍。touchArea(target) 返回 true 的地方才认滑动手势（避免和游戏里的滑动移动混在一起）。
 * 返回解绑函数。
 */
export function bindCheat(onUnlock: () => void, touchArea: (target: EventTarget | null) => boolean): () => void {
  const keys = new Matcher(CODE, onUnlock);
  const touch = new Matcher(TOUCH_CODE, onUnlock);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const s = KEY_SYM[e.code];
    if (s) keys.push(s);
    else if (e.key !== 'Shift') keys.reset();
  };

  let sx = 0;
  let sy = 0;
  let active = false;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    active = touchArea(e.target);
    sx = e.clientX;
    sy = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !active) return;
    active = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < 30) return touch.push('A'); // 点一下
    touch.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp, true);
  };
}
