import { Graphics } from 'pixi.js';
import { Board, DX, DY, GATE_PAST, Instr, Tile, WAIT } from '../core/types';
import { THEME } from './theme';

// 所有绘制都在逻辑坐标里进行：一格 CELL 像素，整体再缩放适配屏幕。
export const CELL = 64;
const H = CELL / 2;

/** 静态地形。glow=true 时只画会发光的线条（放进模糊层） */
export function drawStatic(g: Graphics, board: Board, glow: boolean): void {
  const { w, h } = board;
  const isWall = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && board.tiles[y * w + x] === Tile.Wall;
  const isFloor = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && board.tiles[y * w + x] === Tile.Floor;

  for (let i = 0; i < w * h; i++) {
    const cx = i % w;
    const cy = (i / w) | 0;
    const x = cx * CELL;
    const y = cy * CELL;
    const t = board.tiles[i];
    if (t === Tile.Floor) {
      if (!glow) {
        g.rect(x + 1, y + 1, CELL - 2, CELL - 2).fill({ color: THEME.floor });
        g.rect(x + 1, y + 1, CELL - 2, CELL - 2).stroke({ width: 1, color: THEME.floorEdge, alpha: 0.5 });
      }
      if (board.goals[i]) drawGoal(g, x + H, y + H, glow);
      if (board.exits[i]) drawExit(g, x + H, y + H, glow);
      if (board.oneway[i] >= 0) drawChevron(g, x + H, y + H, board.oneway[i], THEME.oneway, glow ? 0.6 : 0.9);
      if (board.gates[i]) drawGate(g, x + H, y + H, board.gates[i] === GATE_PAST, glow);
      if (board.portal[i] >= 0) drawPortal(g, x + H, y + H, glow);
      if (board.hold[i]) drawHold(g, x + H, y + H, glow);
      if (board.release[i]) drawRelease(g, x + H, y + H, glow);
    } else if (t === Tile.Wall) {
      // 只填充贴着地板的墙（含对角），外围留空
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(cx + dx, cy + dy)) near = true;
      if (!near) continue;
      if (!glow) g.rect(x, y, CELL, CELL).fill({ color: THEME.wall, alpha: 0.2 });
      // 只在与地板相邻的边画霓虹线
      const edges: [number, number, number, number, boolean][] = [
        [x, y, x + CELL, y, isFloor(cx, cy - 1)],
        [x + CELL, y, x + CELL, y + CELL, isFloor(cx + 1, cy)],
        [x, y + CELL, x + CELL, y + CELL, isFloor(cx, cy + 1)],
        [x, y, x, y + CELL, isFloor(cx - 1, cy)],
      ];
      for (const [x1, y1, x2, y2, lit] of edges) {
        if (!lit) continue;
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: glow ? 6 : 2.5, color: THEME.wallEdge, alpha: glow ? 0.7 : 1 });
      }
      if (!glow && !isWall(cx, cy - 1) && !isWall(cx, cy + 1) && !isWall(cx - 1, cy) && !isWall(cx + 1, cy)) {
        g.rect(x + 8, y + 8, CELL - 16, CELL - 16).stroke({ width: 2, color: THEME.wallEdge });
      }
    }
  }
}

/** 身份闸：过去之闸是虚线框 + 竖条（影子能穿），现在之闸是实线框 + 横条（只有你能过） */
function drawGate(g: Graphics, x: number, y: number, past: boolean, glow: boolean): void {
  const c = past ? THEME.gatePast : THEME.gateNow;
  const r = CELL * 0.42;
  const w = glow ? 4 : 2;
  if (past) {
    // 虚线框：每条边 4 段
    const seg = (r * 2) / 7;
    for (let k = 0; k < 4; k++) {
      const a = -r + k * seg * 2;
      g.moveTo(x + a, y - r).lineTo(x + a + seg, y - r);
      g.moveTo(x + a, y + r).lineTo(x + a + seg, y + r);
      g.moveTo(x - r, y + a).lineTo(x - r, y + a + seg);
      g.moveTo(x + r, y + a).lineTo(x + r, y + a + seg);
    }
    g.stroke({ width: w, color: c, alpha: 0.85 });
  } else {
    g.rect(x - r, y - r, r * 2, r * 2).stroke({ width: w, color: c, alpha: 0.9 });
  }
  for (let k = -1; k <= 1; k++) {
    if (past) g.moveTo(x + k * r * 0.45, y - r * 0.7).lineTo(x + k * r * 0.45, y + r * 0.7);
    else g.moveTo(x - r * 0.7, y + k * r * 0.45).lineTo(x + r * 0.7, y + k * r * 0.45);
  }
  g.stroke({ width: w, color: c, alpha: past ? 0.55 : 0.7 });
}

/** 待命台：六边形 + 暂停符号 */
function drawHold(g: Graphics, x: number, y: number, glow: boolean): void {
  const r = CELL * 0.4;
  const pts: number[] = [];
  for (let k = 0; k < 6; k++) pts.push(x + Math.cos((k * Math.PI) / 3) * r, y + Math.sin((k * Math.PI) / 3) * r);
  g.poly(pts).stroke({ width: glow ? 4 : 2, color: THEME.hold, alpha: 0.8 });
  if (!glow) {
    g.rect(x - 7, y - 8, 4, 16).fill({ color: THEME.hold, alpha: 0.7 });
    g.rect(x + 3, y - 8, 4, 16).fill({ color: THEME.hold, alpha: 0.7 });
  }
}

/** 释放板：圆角方框 + 播放三角 */
function drawRelease(g: Graphics, x: number, y: number, glow: boolean): void {
  const r = CELL * 0.36;
  g.roundRect(x - r, y - r, r * 2, r * 2, 10).stroke({ width: glow ? 4 : 2.5, color: THEME.release, alpha: 0.85 });
  g.poly([x - 6, y - 9, x - 6, y + 9, x + 9, y]).fill({ color: THEME.release, alpha: glow ? 0.5 : 0.8 });
}

function drawPortal(g: Graphics, x: number, y: number, glow: boolean): void {
  for (const [s, a] of [[0.4, 0.95], [0.28, 0.6], [0.16, 0.4]] as const) {
    g.circle(x, y, CELL * s).stroke({ width: glow ? 5 : 2, color: THEME.portal, alpha: a });
  }
}

/** 裂地：没塌时画裂纹，塌了画成黑洞 */
export function drawCracks(g: Graphics, board: Board, broken: number, glow: boolean): void {
  const { w } = board;
  board.crackCells.forEach((cell, bit) => {
    const x = (cell % w) * CELL;
    const y = ((cell / w) | 0) * CELL;
    if (broken & (1 << bit)) {
      if (glow) return;
      g.rect(x + 3, y + 3, CELL - 6, CELL - 6).fill({ color: 0x000000 }).stroke({ width: 2, color: THEME.crack, alpha: 0.5 });
      return;
    }
    const pts = [[0.2, 0.15], [0.42, 0.4], [0.33, 0.62], [0.55, 0.85]];
    const pts2 = [[0.42, 0.4], [0.7, 0.32], [0.85, 0.5]];
    for (const line of [pts, pts2]) {
      line.forEach(([px, py], k) => (k ? g.lineTo(x + px * CELL, y + py * CELL) : g.moveTo(x + px * CELL, y + py * CELL)));
    }
    g.stroke({ width: glow ? 4 : 2, color: THEME.crack, alpha: glow ? 0.4 : 0.9 });
  });
}

function drawGoal(g: Graphics, x: number, y: number, glow: boolean): void {
  const r = CELL * 0.3;
  g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).stroke({ width: glow ? 5 : 2, color: THEME.goal, alpha: 0.85 });
  if (!glow) g.circle(x, y, 3).fill({ color: THEME.goal });
}

function drawExit(g: Graphics, x: number, y: number, glow: boolean): void {
  for (const [s, a] of [
    [0.38, 1],
    [0.26, 0.6],
    [0.14, 0.35],
  ] as const) {
    const r = CELL * s;
    g.rect(x - r, y - r, r * 2, r * 2).stroke({ width: glow ? 5 : 2, color: THEME.exit, alpha: a });
  }
}

export function drawChevron(g: Graphics, x: number, y: number, dir: number, color: number, alpha: number): void {
  const s = CELL * 0.16;
  for (const off of [-s * 0.9, s * 0.9]) {
    const ox = x + DX[dir] * off;
    const oy = y + DY[dir] * off;
    const px = -DY[dir];
    const py = DX[dir];
    g.moveTo(ox - DX[dir] * s + px * s, oy - DY[dir] * s + py * s)
      .lineTo(ox, oy)
      .lineTo(ox - DX[dir] * s - px * s, oy - DY[dir] * s - py * s)
      .stroke({ width: 3, color, alpha, cap: 'round', join: 'round' });
  }
}

/** 压力板与门（随状态变化） */
export function drawSwitches(g: Graphics, board: Board, open: boolean[], occupied: Set<number>, glow: boolean): void {
  const { w } = board;
  for (let i = 0; i < board.w * board.h; i++) {
    const x = (i % w) * CELL + H;
    const y = ((i / w) | 0) * CELL + H;
    const pc = board.plates[i];
    if (pc) {
      const color = THEME.plate[pc];
      const on = occupied.has(i);
      g.roundRect(x - CELL * 0.36, y - CELL * 0.36, CELL * 0.72, CELL * 0.72, 10).stroke({ width: glow ? 5 : 2.5, color, alpha: on ? 1 : 0.6 });
      if (on) g.roundRect(x - CELL * 0.26, y - CELL * 0.26, CELL * 0.52, CELL * 0.52, 6).fill({ color, alpha: glow ? 0.6 : 0.35 });
    }
    const dc = board.doors[i];
    if (dc) {
      const color = THEME.plate[dc];
      const r = CELL * 0.44;
      if (open[dc] || occupied.has(i)) {
        g.rect(x - r, y - r, r * 2, r * 2).stroke({ width: 1.5, color, alpha: glow ? 0.15 : 0.35 });
      } else {
        g.rect(x - r, y - r, r * 2, r * 2).fill({ color, alpha: glow ? 0.25 : 0.18 }).stroke({ width: glow ? 5 : 2.5, color });
        for (let k = -1; k <= 1; k++) {
          g.moveTo(x + k * r * 0.5, y - r).lineTo(x + k * r * 0.5, y + r).stroke({ width: 2, color, alpha: 0.8 });
        }
      }
    }
  }
}

// ---- 实体（以格子中心为原点绘制） ----

export function drawPlayer(g: Graphics, recording: boolean, glow: boolean): void {
  const c = recording ? THEME.recording : THEME.player;
  const r = CELL * 0.34;
  g.roundRect(-r, -r, r * 2, r * 2, 12).fill({ color: c, alpha: glow ? 0.5 : 0.18 }).stroke({ width: glow ? 6 : 3, color: c });
  if (!glow) {
    g.circle(-r * 0.38, -r * 0.15, 4).fill({ color: 0xffffff });
    g.circle(r * 0.38, -r * 0.15, 4).fill({ color: 0xffffff });
  }
}

export function drawGhost(g: Graphics, color: number, next: Instr | null, glow: boolean, echo = false, waiting = false): void {
  const r = CELL * 0.32;
  const dormant = next === null || waiting;
  if (echo) {
    // 残影：四角括号，和玩家录的影子区分开
    const k = r * 0.55;
    const o = r + 6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.moveTo(sx * o, sy * (o - k)).lineTo(sx * o, sy * o).lineTo(sx * (o - k), sy * o)
        .stroke({ width: glow ? 4 : 2, color, alpha: dormant ? 0.35 : 0.8 });
    }
  }
  g.roundRect(-r, -r, r * 2, r * 2, 14).fill({ color, alpha: dormant ? 0.08 : glow ? 0.35 : 0.14 });
  g.roundRect(-r, -r, r * 2, r * 2, 14).stroke({ width: glow ? 5 : 2.5, color, alpha: dormant ? 0.4 : 0.95 });
  if (glow) return;
  if (waiting) {
    g.rect(-6, -7, 4, 14).fill({ color, alpha: 0.8 });
    g.rect(2, -7, 4, 14).fill({ color, alpha: 0.8 });
  } else if (dormant) {
    g.moveTo(-r * 0.4, 0).lineTo(r * 0.4, 0).stroke({ width: 3, color, alpha: 0.5, cap: 'round' });
  } else if (next === WAIT) {
    g.circle(0, 0, 5).fill({ color });
  } else {
    drawChevron(g, 0, 0, next, color, 1);
  }
}

export function drawBox(g: Graphics, onGoal: boolean, glow: boolean): void {
  const c = onGoal ? THEME.boxOnGoal : THEME.box;
  const r = CELL * 0.36;
  g.rect(-r, -r, r * 2, r * 2).fill({ color: c, alpha: glow ? 0.4 : onGoal ? 0.3 : 0.15 }).stroke({ width: glow ? 6 : 3, color: c });
  if (!glow) {
    g.moveTo(-r * 0.55, -r * 0.55).lineTo(r * 0.55, r * 0.55).stroke({ width: 2, color: c, alpha: 0.8 });
    g.moveTo(r * 0.55, -r * 0.55).lineTo(-r * 0.55, r * 0.55).stroke({ width: 2, color: c, alpha: 0.8 });
  }
}
