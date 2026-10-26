import { BlurFilter, Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { parseLevel } from '../core/level';
import { CELL, drawBox, drawCracks, drawGhost, drawPlayer, drawStatic, drawSwitches } from './draw';
import { THEME } from './theme';

// 编辑器工具图标：用和地图上完全一样的画法画一格（含发光层），导出成图片，保证视觉一致。

const cache = new Map<string, string>();
const MARGIN = 6;

/** 工具对应的地图字符 → 一张小地图里中间那格放什么。实体（你 / 箱子 / 残影）放在地板上另画 */
function tileFor(ch: string): string {
  if ('@$1'.includes(ch)) return '.';
  if (ch === 'O') return '(';
  return ch;
}

export function toolIcon(renderer: Renderer, ch: string): string {
  const hit = cache.get(ch);
  if (hit) return hit;

  const root = new Container();
  const main = new Graphics();
  const glowG = new Graphics();
  const glow = new Container();
  glow.addChild(glowG);
  glow.filters = [new BlurFilter({ strength: 8, quality: 3 })];
  glow.blendMode = 'add';
  root.addChild(main, glow);
  const cx = CELL * 1.5;
  const cy = CELL * 1.5;

  if (ch === ' ') {
    // 擦除：虚线空格 + 斜线
    const r = CELL * 0.38;
    for (let k = 0; k < 4; k++) {
      const a = -r + (k * 2 * r) / 4;
      const s = (2 * r) / 8;
      main.moveTo(cx + a, cy - r).lineTo(cx + a + s, cy - r).moveTo(cx + a, cy + r).lineTo(cx + a + s, cy + r);
      main.moveTo(cx - r, cy + a).lineTo(cx - r, cy + a + s).moveTo(cx + r, cy + a).lineTo(cx + r, cy + a + s);
    }
    main.stroke({ width: 3, color: THEME.wallEdge, alpha: 0.7 });
    main.moveTo(cx - r * 0.6, cy + r * 0.6).lineTo(cx + r * 0.6, cy - r * 0.6).stroke({ width: 3, color: THEME.recording, alpha: 0.8, cap: 'round' });
  } else {
    // 3×4 的小地图，目标格在 (1,1)；@ 放在角落只是为了能解析，不会画出来
    const rows = ['...@', '.' + tileFor(ch) + '..', '...' + (ch === 'O' ? ')' : '.')];
    const { board } = parseLevel({ map: rows });
    drawStatic(main, board, false);
    drawStatic(glowG, board, true);
    drawSwitches(main, board, [false, false, false, false, false], new Set(), false);
    drawSwitches(glowG, board, [false, false, false, false, false], new Set(), true);
    drawCracks(main, board, 0, false);
    drawCracks(glowG, board, 0, true);
    if (ch === '.') {
      // 地板在暗色按钮上几乎看不见：描一圈细边
      main.rect(CELL + 4, CELL + 4, CELL - 8, CELL - 8).stroke({ width: 2, color: THEME.wallEdge, alpha: 0.45 });
    }
    if (ch === '#') {
      // 单独一格墙没有“贴着地板的边”，补上实心块，看起来像墙而不是框
      main.rect(CELL + 6, CELL + 6, CELL - 12, CELL - 12).fill({ color: THEME.wallEdge, alpha: 0.35 });
    }
    const entity = (draw: (g: Graphics, glow: boolean) => void) => {
      const m = new Graphics();
      const gl = new Graphics();
      draw(m, false);
      draw(gl, true);
      m.position.set(cx, cy);
      gl.position.set(cx, cy);
      root.addChild(m);
      glow.addChild(gl);
    };
    if (ch === '@') entity((g, gl) => drawPlayer(g, false, gl));
    if (ch === '$') entity((g, gl) => drawBox(g, false, gl));
    if (ch === '1') entity((g, gl) => drawGhost(g, THEME.echo, 1, gl, true));
  }

  const canvas = renderer.extract.canvas({
    target: root,
    frame: new Rectangle(CELL - MARGIN, CELL - MARGIN, CELL + MARGIN * 2, CELL + MARGIN * 2),
    resolution: 2,
    clearColor: 0x00000000,
  }) as HTMLCanvasElement;
  const url = canvas.toDataURL();
  root.destroy({ children: true });
  cache.set(ch, url);
  return url;
}
