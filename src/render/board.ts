import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import { doorStates } from '../core/sim';
import { Board, GameState, SimEvent } from '../core/types';
import { CELL, drawBox, drawCracks, drawGhost, drawPlayer, drawStatic, drawSwitches } from './draw';
import { ghostColor, THEME } from './theme';

const BEAT_MS = 130;

interface EntityView {
  main: Graphics;
  glow: Graphics;
  x: number;
  y: number;
  /** 本拍的路点（逻辑像素）；jump=true 表示穿传送门，瞬移过去 */
  path: { x: number; y: number; jump?: boolean }[];
  t: number;
  look: string;
  bump: { dx: number; dy: number; t: number } | null;
}

/** 叠加层：过关回放的“原本 vs 实际”，或者预演接下来几步 */
export type Overlay =
  | null
  | { kind: 'compare'; ghosts: { color: number; planned: number[]; actual: number[] }[] }
  | { kind: 'preview'; ghosts: { color: number; cells: number[]; blockedAt: number[] }[] };

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/** Pixi 棋盘视图：静态地形 + 动态实体 + 发光层 + 粒子 */
export class BoardView {
  readonly app = new Application();
  private root = new Container();
  private glowLayer = new Container();
  private mainLayer = new Container();
  private staticMain = new Graphics();
  private staticGlow = new Graphics();
  private switchMain = new Graphics();
  private switchGlow = new Graphics();
  private trails = new Graphics();
  private fx = new Container();
  private entities = new Map<string, EntityView>();
  private particles: Particle[] = [];
  private board: Board | null = null;
  private state: GameState | null = null;
  private time = 0;
  showTrails = true;
  private overlay: Overlay = null;
  private overlayG = new Graphics();

  constructor(private host: HTMLElement) {}

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      background: THEME.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.host.appendChild(this.app.canvas);
    this.glowLayer.filters = [new BlurFilter({ strength: 10, quality: 3 })];
    this.glowLayer.blendMode = 'add';
    this.glowLayer.addChild(this.staticGlow, this.switchGlow);
    this.mainLayer.addChild(this.staticMain, this.switchMain, this.trails);
    this.fx.addChild(this.overlayG);
    this.root.addChild(this.mainLayer, this.glowLayer, this.fx);
    this.app.stage.addChild(this.root);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.observer.observe(this.host);
  }

  private observer = new ResizeObserver(() => {
    this.app.resize();
    this.layout();
  });

  /** 把画布移到另一个容器（游戏 / 编辑器共用一个 WebGL 上下文） */
  attach(host: HTMLElement): void {
    if (host === this.host) return;
    this.observer.unobserve(this.host);
    this.host = host;
    host.appendChild(this.app.canvas);
    this.app.resizeTo = host;
    this.observer.observe(host);
  }

  setLevel(board: Board): void {
    this.board = board;
    for (const e of this.entities.values()) {
      e.main.destroy();
      e.glow.destroy();
    }
    this.entities.clear();
    this.state = null;
    this.staticMain.clear();
    this.staticGlow.clear();
    drawStatic(this.staticMain, board, false);
    drawStatic(this.staticGlow, board, true);
    this.layout();
  }

  /** 让视图跟上新状态。events 来自本拍模拟，用于生成路点动画；instant 用于撤销/封存等跳变 */
  sync(state: GameState, events: SimEvent[] = [], instant = false): void {
    const board = this.board;
    if (!board) return;
    this.state = state;
    const w = state.world;
    const live = new Set<string>();
    const recording = !!state.rec;

    const place = (id: string, cell: number, look: string, draw: (g: Graphics, glow: boolean) => void) => {
      live.add(id);
      let e = this.entities.get(id);
      const tx = this.cx(cell);
      const ty = this.cy(cell);
      if (!e) {
        e = { main: new Graphics(), glow: new Graphics(), x: tx, y: ty, path: [], t: 1, look: '', bump: null };
        this.mainLayer.addChild(e.main);
        this.glowLayer.addChild(e.glow);
        this.entities.set(id, e);
      }
      if (e.look !== look) {
        e.look = look;
        e.main.clear();
        e.glow.clear();
        draw(e.main, false);
        draw(e.glow, true);
      }
      const moves = events.filter((ev) => ev.t === 'move' && ev.id === id) as Extract<SimEvent, { t: 'move' }>[];
      if (instant || !moves.length) {
        if (instant || e.t >= 1) {
          e.x = tx;
          e.y = ty;
          e.path = [];
          e.t = 1;
        }
      } else {
        // 从当前显示位置出发，依次经过每段移动的终点；穿门时先走到入口再瞬移到出口
        const pts: EntityView['path'] = [{ x: e.x, y: e.y }];
        for (const m of moves) {
          if (m.via !== undefined) pts.push({ x: this.cx(m.via), y: this.cy(m.via) });
          pts.push({ x: this.cx(m.to), y: this.cy(m.to), jump: m.via !== undefined });
        }
        e.path = pts;
        e.t = 0;
      }
      const bump = events.find((ev) => ev.t === 'bump' && ev.id === id) as Extract<SimEvent, { t: 'bump' }> | undefined;
      if (bump && !instant) e.bump = { dx: [0, 1, 0, -1][bump.dir], dy: [-1, 0, 1, 0][bump.dir], t: 0 };
    };

    w.ghosts.forEach((g) => {
      if (g.gone) return; // 掉进坑里了
      const next = g.ip < g.program.length ? g.program[g.ip] : null;
      const color = ghostColor(g, w.ghosts);
      const echo = !!g.preset;
      const waiting = !!g.waiting;
      place('g' + g.id, g.pos, `g${next}${echo}${color}${waiting}`, (gr, glow) => drawGhost(gr, color, next, glow, echo, waiting));
    });
    w.boxes.forEach((b, i) => {
      const on = !!board.goals[b];
      place('b' + i, b, on ? 'on' : 'off', (gr, glow) => drawBox(gr, on, glow));
    });
    place('p', w.player, recording ? 'rec' : 'idle', (gr, glow) => drawPlayer(gr, recording, glow));

    for (const [id, e] of this.entities) {
      if (live.has(id)) continue;
      e.main.destroy();
      e.glow.destroy();
      this.entities.delete(id);
    }
    // 玩家总是画在最上层
    const p = this.entities.get('p');
    if (p) {
      this.mainLayer.setChildIndex(p.main, this.mainLayer.children.length - 1);
    }
    this.redrawDynamic();

    for (const ev of events) {
      if (instant) continue;
      if (ev.t === 'move' && ev.pushed) this.burst(this.cx(ev.to), this.cy(ev.to), THEME.wallEdge, 6);
      if (ev.t === 'move' && ev.via !== undefined) {
        this.burst(this.cx(ev.via), this.cy(ev.via), THEME.portal, 10);
        this.burst(this.cx(ev.to), this.cy(ev.to), THEME.portal, 10);
      }
      if (ev.t === 'crack') this.burst(this.cx(ev.at), this.cy(ev.at), THEME.crack, 16, 90);
      if (ev.t === 'erase') this.burst(this.cx(ev.at), this.cy(ev.at), THEME.recording, 26, 60);
      if (ev.t === 'release') {
        const g = state.world.ghosts.find((x) => 'g' + x.id === ev.id);
        if (g && g.pos >= 0) this.burst(this.cx(g.pos), this.cy(g.pos), THEME.release, 14, 120);
      }
    }
  }
  private redrawDynamic(): void {
    const board = this.board;
    const s = this.state;
    if (!board || !s) return;
    const w = s.world;
    const occupied = new Set<number>([w.player, ...w.boxes, ...w.ghosts.map((g) => g.pos)]);
    const open = doorStates(board, w);
    this.switchMain.clear();
    this.switchGlow.clear();
    drawSwitches(this.switchMain, board, open, occupied, false);
    drawSwitches(this.switchGlow, board, open, occupied, true);
    drawCracks(this.switchMain, board, w.broken, false);
    drawCracks(this.switchGlow, board, w.broken, true);
    this.drawOverlay();

    const t = this.trails;
    t.clear();
    if (this.showTrails) {
      // Ghost 录制时的原始轨迹（虚线点），与实际位置对照
      for (const g of w.ghosts) {
        if (g.preset || g.gone) continue;
        const color = ghostColor(g, w.ghosts);
        g.recPath.forEach((c, k) => {
          const a = k <= g.ip ? 0.18 : 0.45;
          t.circle(this.cx(c), this.cy(c), k === 0 ? 7 : 4).fill({ color, alpha: a });
        });
      }
    }
    if (s.rec) {
      // 当前录制：锚点 + 轨迹
      const a = s.rec.anchor.player;
      const r = CELL * 0.44;
      t.rect(this.cx(a) - r, this.cy(a) - r, r * 2, r * 2).stroke({ width: 2, color: THEME.recording, alpha: 0.9 });
      const pts = s.rec.path;
      for (let k = 1; k < pts.length; k++) {
        t.moveTo(this.cx(pts[k - 1]), this.cy(pts[k - 1]))
          .lineTo(this.cx(pts[k]), this.cy(pts[k]))
          .stroke({ width: 3, color: THEME.recording, alpha: 0.5 });
      }
    }
  }

  setOverlay(o: Overlay): void {
    this.overlay = o;
    this.drawOverlay();
  }

  private drawOverlay(): void {
    const g = this.overlayG;
    g.clear();
    const o = this.overlay;
    if (!o || !this.board) return;
    const line = (a: number, b: number, color: number, alpha: number, width: number, dashed: boolean) => {
      const x1 = this.cx(a), y1 = this.cy(a), x2 = this.cx(b), y2 = this.cy(b);
      if (Math.abs(x2 - x1) + Math.abs(y2 - y1) > CELL * 1.5) return; // 传送门不连线
      if (!dashed) return void g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width, color, alpha, cap: 'round' });
      for (let k = 0; k < 4; k++) {
        const u0 = k / 4, u1 = u0 + 0.13;
        g.moveTo(x1 + (x2 - x1) * u0, y1 + (y2 - y1) * u0).lineTo(x1 + (x2 - x1) * u1, y1 + (y2 - y1) * u1);
      }
      g.stroke({ width, color, alpha, cap: 'round' });
    };
    if (o.kind === 'compare') {
      for (const gh of o.ghosts) {
        // 虚线：留影时原本走的路；实线：最终实际走的路
        for (let k = 1; k < gh.planned.length; k++) line(gh.planned[k - 1], gh.planned[k], gh.color, 0.9, 4, true);
        for (const c of gh.planned) g.circle(this.cx(c), this.cy(c), 5).stroke({ width: 2, color: gh.color, alpha: 0.9 });
        for (let k = 1; k < gh.actual.length; k++) line(gh.actual[k - 1], gh.actual[k], gh.color, 0.6, 7, false);
        // 第一次分岔的地方画个圈
        const n = Math.min(gh.planned.length, gh.actual.length);
        for (let k = 0; k < n; k++) {
          if (gh.planned[k] === gh.actual[k]) continue;
          g.circle(this.cx(gh.actual[k]), this.cy(gh.actual[k]), CELL * 0.42).stroke({ width: 3, color: THEME.recording, alpha: 0.9 });
          break;
        }
      }
    } else {
      for (const gh of o.ghosts) {
        gh.cells.forEach((c, k) => {
          const a = 0.85 - k * 0.12;
          g.circle(this.cx(c), this.cy(c), CELL * (0.2 - k * 0.02)).stroke({ width: 3, color: gh.color, alpha: Math.max(0.2, a) });
        });
        for (const c of gh.blockedAt) {
          const x = this.cx(c), y = this.cy(c), r = CELL * 0.16;
          g.moveTo(x - r, y - r).lineTo(x + r, y + r).moveTo(x + r, y - r).lineTo(x - r, y + r).stroke({ width: 3, color: THEME.recording });
        }
      }
    }
  }

  private cx(cell: number): number {
    return ((cell % this.board!.w) + 0.5) * CELL;
  }
  private cy(cell: number): number {
    return (((cell / this.board!.w) | 0) + 0.5) * CELL;
  }

  layout(): void {
    const b = this.board;
    if (!b) return;
    const W = this.host.clientWidth;
    const Hh = this.host.clientHeight;
    const pad = Math.min(W, Hh) < 500 ? 6 : 16;
    const s = Math.min((W - pad * 2) / (b.w * CELL), (Hh - pad * 2) / (b.h * CELL), 1.6);
    this.root.scale.set(s);
    this.root.x = Math.round((W - b.w * CELL * s) / 2);
    this.root.y = Math.round((Hh - b.h * CELL * s) / 2);
  }

  /** 把屏幕坐标（相对 host）换算成格子编号，越界返回 -1 */
  cellAt(px: number, py: number): number {
    const b = this.board;
    if (!b) return -1;
    const s = this.root.scale.x;
    const x = Math.floor((px - this.root.x) / s / CELL);
    const y = Math.floor((py - this.root.y) / s / CELL);
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return -1;
    return y * b.w + x;
  }

  private tick(dt: number): void {
    this.time += dt;
    for (const e of this.entities.values()) {
      if (e.t < 1 && e.path.length > 1) {
        e.t = Math.min(1, e.t + dt / BEAT_MS);
        const segs = e.path.length - 1;
        const f = easeOut(e.t) * segs;
        const k = Math.min(segs - 1, Math.floor(f));
        const u = f - k;
        const b = e.path[k + 1];
        if (b.jump) {
          // 传送：前半段停在入口，过半瞬移到出口
          const p = u < 0.5 ? e.path[k] : b;
          e.x = p.x;
          e.y = p.y;
        } else {
          e.x = e.path[k].x + (b.x - e.path[k].x) * u;
          e.y = e.path[k].y + (b.y - e.path[k].y) * u;
        }
      }
      let ox = 0;
      let oy = 0;
      if (e.bump) {
        e.bump.t += dt / 160;
        const amp = Math.sin(Math.min(1, e.bump.t) * Math.PI) * 6;
        ox = e.bump.dx * amp;
        oy = e.bump.dy * amp;
        if (e.bump.t >= 1) e.bump = null;
      }
      e.main.position.set(e.x + ox, e.y + oy);
      e.glow.position.set(e.x + ox, e.y + oy);
    }
    // 玩家录制时呼吸闪烁
    const p = this.entities.get('p');
    if (p) p.glow.alpha = this.state?.rec ? 0.6 + 0.4 * Math.sin(this.time / 160) : 1;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life += dt;
      q.g.x += (q.vx * dt) / 1000;
      q.g.y += (q.vy * dt) / 1000;
      q.g.alpha = 1 - q.life / q.max;
      if (q.life >= q.max) {
        q.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  burst(x: number, y: number, color: number, count: number, speed = 120): void {
    for (let i = 0; i < count; i++) {
      const g = new Graphics().rect(-2, -2, 4, 4).fill({ color });
      g.position.set(x, y);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.fx.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 350 + Math.random() * 300 });
    }
  }

  burstAt(cell: number, color: number, count: number, speed?: number): void {
    if (this.board) this.burst(this.cx(cell), this.cy(cell), color, count, speed);
  }

  /** 时间回溯的全屏特效（CSS，作用在画布上） */
  flash(kind: 'rewind' | 'win'): void {
    const c = this.app.canvas;
    c.classList.remove('fx-rewind', 'fx-win');
    void c.offsetWidth;
    c.classList.add(kind === 'rewind' ? 'fx-rewind' : 'fx-win');
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
