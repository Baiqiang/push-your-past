import { Board, DX, DY, Dir, GATE_NOW, GATE_PAST, Ghost, Instr, SimEvent, Tile, WAIT, World } from './types';

/*
 * 一拍（beat）的执行规则：
 *   1. Ghost 按出生顺序依次执行自己的下一条指令（指令指针总是前进，被挡也消耗）
 *   2. 玩家执行本拍输入
 * 移动规则：
 *   - 推力为 1：人形实体（玩家 / Ghost）可以推动前方格子里的对象一格，
 *     前提是对象身后的格子可进入且为空；箱子不能推任何东西。
 *   - 被推不消耗被推者的指令。
 *   - 同一格可能短暂重叠（Ghost 出生时与玩家同格）；推这样的格子会把整叠一起推走。
 *   - 门：同通道的任意压力板上有任何实体时打开；进入门格需要门开着。
 *     门格里有东西时门关不上（被卡住），视为开着。
 *   - 单向格：只能沿箭头方向进入（走入或被推入都一样）。
 *   - 指令执行完的 Ghost 进入休眠：留在原地，仍有碰撞，仍可被推。
 *   - 身份闸：S 只放影子进，Y 只放玩家进；箱子两种都进不去。
 *   - 裂地：格子上最后一个东西离开时塌成坑。回溯时随世界快照一起复原。
 *     你和箱子进不了坑；影子走进坑（或被推进坑）就被抹除，剩下的动作作废。
 *   - 传送门：进入一端时直接落到另一端（落点按同一方向检查单向 / 门 / 闸）。
 *     推东西时，被推者同样会穿过传送门。
 *   - 待命 / 释放：从待命台 H 留下的影子先不动（不消耗步数）。每一步开始时，
 *     只要释放板 r 上有东西，所有待命的影子就从这一步起开始走，之后不再停。
 *   以上规则在 solver.ts 里有一份整数版实现，两边必须一致（tests/solver.test.ts 对拍）。
 */

const PLAYER = -1;
const GHOST_BASE = 1 << 16;

export function entityName(ref: number): string {
  if (ref === PLAYER) return 'p';
  if (ref >= GHOST_BASE) return 'g' + (ref - GHOST_BASE);
  return 'b' + ref;
}

export interface StepOptions {
  /** 求解器模式：不维护日志，不产生事件 */
  light?: boolean;
}

export interface StepOutput {
  world: World;
  events: SimEvent[];
}

export function doorStates(board: Board, world: World): boolean[] {
  const open = [false, false, false, false, false];
  const mark = (p: number) => {
    const ch = board.plates[p];
    if (ch) open[ch] = true;
  };
  mark(world.player);
  for (const b of world.boxes) mark(b);
  for (const g of world.ghosts) mark(g.pos);
  return open;
}

export function step(board: Board, world: World, playerInstr: Instr, opts: StepOptions = {}): StepOutput {
  const light = !!opts.light;
  const events: SimEvent[] = [];
  const { w } = board;
  const n = board.w * board.h;

  let player = world.player;
  let broken = world.broken;
  const boxes = world.boxes.slice();
  const gpos = world.ghosts.map((g) => g.pos);
  const ghostIds = world.ghosts.map((g) => g.id);

  const getPos = (ref: number) =>
    ref === PLAYER ? player : ref >= GHOST_BASE ? gpos[ghostIndex(ref)] : boxes[ref];
  const setPos = (ref: number, p: number) => {
    if (ref === PLAYER) player = p;
    else if (ref >= GHOST_BASE) gpos[ghostIndex(ref)] = p;
    else boxes[ref] = p;
  };
  function ghostIndex(ref: number) {
    return ghostIds.indexOf(ref - GHOST_BASE);
  }

  const occupants = (cell: number, exclude: number): number[] => {
    const out: number[] = [];
    if (player === cell && exclude !== PLAYER) out.push(PLAYER);
    for (let i = 0; i < boxes.length; i++) if (boxes[i] === cell && exclude !== i) out.push(i);
    for (let i = 0; i < gpos.length; i++) {
      const ref = GHOST_BASE + ghostIds[i];
      if (gpos[i] === cell && exclude !== ref) out.push(ref);
    }
    return out;
  };

  const doorOpen = (ch: number): boolean => {
    if (board.plates[player] === ch) return true;
    for (const b of boxes) if (board.plates[b] === ch) return true;
    for (const g of gpos) if (board.plates[g] === ch) return true;
    return false;
  };

  const neighbor = (p: number, d: Dir): number => {
    const x = (p % w) + DX[d];
    const y = ((p / w) | 0) + DY[d];
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return -1;
    const t = y * w + x;
    return t >= 0 && t < n ? t : -1;
  };

  /** 从 p 朝 d 走一格实际落到哪（穿过传送门）；越界返回 -1 */
  const dest = (p: number, d: Dir): number => {
    const t = neighbor(p, d);
    return t >= 0 && board.portal[t] >= 0 ? board.portal[t] : t;
  };

  const canEnter = (t: number, d: Dir, kind: 'p' | 'b' | 'g'): boolean => {
    if (t < 0 || board.tiles[t] !== Tile.Floor) return false;
    const ow = board.oneway[t];
    if (ow >= 0 && ow !== d) return false;
    const gate = board.gates[t];
    if (gate === GATE_PAST && kind !== 'g') return false;
    if (gate === GATE_NOW && kind !== 'p') return false;
    if (kind !== 'g' && isPit(t)) return false;
    const door = board.doors[t];
    // 门被卡住（门格里有东西）时视为开着
    if (door && !doorOpen(door) && occupants(t, -2).length === 0) return false;
    return true;
  };
  const kindOf = (ref: number): 'p' | 'b' | 'g' => (ref === PLAYER ? 'p' : ref >= GHOST_BASE ? 'g' : 'b');
  const isPit = (t: number): boolean => {
    const ck = board.cracked[t];
    return ck >= 0 && (broken & (1 << ck)) !== 0;
  };
  /** 影子落进坑：抹除 */
  const eraseIfPit = (ref: number, cell: number) => {
    if (ref < GHOST_BASE || !isPit(cell)) return;
    setPos(ref, -1);
    if (!light) events.push({ t: 'erase', id: entityName(ref), at: cell });
  };

  /** 尝试让 mover 朝 d 移动一格，返回是否成功 */
  const tryMove = (mover: number, d: Dir): boolean => {
    const from = getPos(mover);
    const t = dest(from, d);
    const bump = () => {
      if (!light) events.push({ t: 'bump', id: entityName(mover), at: from, dir: d });
      return false;
    };
    if (t === from || !canEnter(t, d, kindOf(mover))) return bump();
    const occ = occupants(t, mover);
    if (occ.length) {
      if (kindOf(mover) === 'b') return bump();
      const t2 = dest(t, d);
      if (t2 === t || t2 === from || occupants(t2, -2).length) return bump();
      for (const o of occ) if (!canEnter(t2, d, kindOf(o))) return bump();
      for (const o of occ) {
        setPos(o, t2);
        if (!light) events.push({ t: 'move', id: entityName(o), from: t, to: t2, pushed: true, via: t2 !== neighbor(t, d) ? neighbor(t, d) : undefined });
        eraseIfPit(o, t2);
      }
    }
    setPos(mover, t);
    if (!light) events.push({ t: 'move', id: entityName(mover), from, to: t, pushed: false, via: t !== neighbor(from, d) ? neighbor(from, d) : undefined });
    eraseIfPit(mover, t);
    // 裂地：最后一个东西离开就塌
    const ck = board.cracked[from];
    if (ck >= 0 && occupants(from, -2).length === 0) {
      broken |= 1 << ck;
      if (!light) events.push({ t: 'crack', at: from });
    }
    return true;
  };

  const doorsBefore = light ? null : doorStates(board, world);

  // 0. 释放：这一步开始时释放板上有东西，待命的影子从这一步起开始走
  const released = isReleasing(board, world);
  const src = released
    ? world.ghosts.map((g) => {
        if (!g.waiting) return g;
        if (!light) events.push({ t: 'release', id: 'g' + g.id });
        return { ...g, waiting: false };
      })
    : world.ghosts;

  // 1. Ghost 依次执行
  const ghosts: Ghost[] = new Array(world.ghosts.length);
  for (let gi = 0; gi < world.ghosts.length; gi++) {
    const g = src[gi];
    if (g.waiting) continue; // 待命中
    if (g.ip >= g.program.length || gpos[gi] < 0) continue; // 演完了，或者这一步里已经被推进坑
    const instr = g.program[g.ip];
    let res: 'ok' | 'blocked' | 'wait' = 'wait';
    if (instr !== WAIT) res = tryMove(GHOST_BASE + g.id, instr) ? 'ok' : 'blocked';
    ghosts[gi] = {
      ...g,
      ip: g.ip + 1,
      log: light ? g.log : [...g.log, res],
    } as Ghost;
    if (!light && g.ip + 1 === g.program.length) events.push({ t: 'dormant', id: 'g' + g.id });
  }

  // 2. 玩家
  if (playerInstr !== WAIT) tryMove(PLAYER, playerInstr);

  for (let gi = 0; gi < world.ghosts.length; gi++) {
    const base = ghosts[gi] ?? src[gi];
    if (gpos[gi] < 0 && !base.gone) ghosts[gi] = { ...base, pos: -1, ip: base.program.length, gone: true };
    else ghosts[gi] = base.pos === gpos[gi] ? base : { ...base, pos: gpos[gi] };
  }

  const next: World = { player, boxes, ghosts, tick: world.tick + 1, broken, inputs: world.inputs };

  if (!light && doorsBefore) {
    const after = doorStates(board, next);
    for (let i = 0; i < n; i++) {
      const ch = board.doors[i];
      if (ch && doorsBefore[ch] !== after[ch]) events.push({ t: 'door', at: i, open: after[ch] });
    }
  }
  return { world: next, events };
}

/** 两个世界在“物理上”是否相同（不比较日志） */
export function sameWorld(a: World, b: World): boolean {
  if (a.player !== b.player || a.broken !== b.broken || a.boxes.length !== b.boxes.length || a.ghosts.length !== b.ghosts.length) return false;
  for (let i = 0; i < a.boxes.length; i++) if (a.boxes[i] !== b.boxes[i]) return false;
  for (let i = 0; i < a.ghosts.length; i++) {
    if (a.ghosts[i].pos !== b.ghosts[i].pos || a.ghosts[i].ip !== b.ghosts[i].ip || !!a.ghosts[i].waiting !== !!b.ghosts[i].waiting) return false;
  }
  return true;
}

export function isActive(g: Ghost): boolean {
  return g.ip < g.program.length;
}

/** 释放板上有没有东西（每一步开始时判断） */
export function isReleasing(board: Board, w: World): boolean {
  if (board.release[w.player]) return true;
  for (const b of w.boxes) if (board.release[b]) return true;
  for (const g of w.ghosts) if (g.pos >= 0 && board.release[g.pos]) return true;
  return false;
}
