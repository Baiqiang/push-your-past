import { runActions } from './game';
import { parseLevel } from './level';
import { GATE_NOW, GATE_PAST, LevelDef, Par, Tile, WAIT } from './types';

/*
 * 求解器（广度优先，返回最短解）。
 *
 * 关键优化：玩家录的每个影子，它的每一个动作在最终那条时间线上恰好只执行一次。
 * 所以不必先枚举整段录像再回放，而是把新影子当成“动作待定”，
 * 轮到它动的时候再当场选（上下左右或原地）。这样状态里不需要存录像内容，
 * 状态数从“地图状态 × 所有可能录像”降到“地图状态 × 每个影子执行到第几步”。
 * 预设影子的动作是固定的，照常回放。
 *
 * 找到解后再把每个影子当场选的动作拼回录像，生成标准动作串，并用 runActions 复核。
 * 内部模拟是 sim.ts 的整数数组版，规则必须保持一致（tests/solver.test.ts 做了对拍）。
 */

export type SolveResult =
  | { status: 'solved'; solution: string; nodes: number }
  | { status: 'unsolvable'; nodes: number }
  | { status: 'limit'; nodes: number };

export type Kind = 'p' | 'b' | 'g';

export interface SolveOptions {
  maxNodes?: number;
  /** 覆盖关卡的影子上限（例如验证“少一个影子就无解”） */
  maxGhosts?: number;
  maxRecord?: number;
  onProgress?: (nodes: number) => void;
  /** 消融：禁止这些推动，例如 ['p>g'] 表示玩家不能推影子 */
  forbidPush?: `${Kind}>${Kind}`[];
  /** 消融：影子的一步不能被其他东西挡住 */
  forbidBlock?: boolean;
  /** 消融：不能在有影子演到一半时开始录制 */
  forbidSlice?: boolean;
  /** 消融：影子也进不了坑（不能被抹除） */
  forbidErase?: boolean;
}

type Def = Pick<LevelDef, 'map' | 'presets' | 'maxGhosts' | 'maxRecord'>;

export function solveWithoutGhosts(def: Pick<LevelDef, 'map' | 'presets'>, opts: SolveOptions = {}): SolveResult {
  return solve({ ...def, maxGhosts: 0, maxRecord: 1 }, { ...opts, maxGhosts: 0 });
}

const CHOICE_ORDER = [WAIT, 0, 1, 2, 3, 5];
const KIND_INDEX: Record<Kind, number> = { p: 0, b: 1, g: 2 };

export function solve(def: Def, opts: SolveOptions = {}): SolveResult {
  const { board, world } = parseLevel(def);
  const maxGhosts = opts.maxGhosts ?? def.maxGhosts;
  const maxRecord = Math.max(1, opts.maxRecord ?? def.maxRecord);
  const maxNodes = opts.maxNodes ?? 3_000_000;
  const W = board.w;
  const N = board.w * board.h;
  const nb = world.boxes.length;
  const presets = world.ghosts.map((g) => g.program);
  const np = presets.length;
  const forbidPush = new Uint8Array(9);
  for (const f of opts.forbidPush ?? []) forbidPush[KIND_INDEX[f[0] as Kind] * 3 + KIND_INDEX[f[2] as Kind]] = 1;
  const forbidBlock = !!opts.forbidBlock;
  const forbidSlice = !!opts.forbidSlice;
  const forbidErase = !!opts.forbidErase;
  // 消融“切片”时，待定影子需要能提前收工，否则它一直算“演到一半”
  const END = 5;
  const base = forbidSlice ? 6 : 5;

  // 静态邻接与可进入性
  const nbr = new Int32Array(N * 4).fill(-1);
  const enter = new Uint8Array(N * 4);
  for (let c = 0; c < N; c++) {
    const x = c % W;
    const y = (c / W) | 0;
    const cand = [y > 0 ? c - W : -1, x < W - 1 ? c + 1 : -1, y < board.h - 1 ? c + W : -1, x > 0 ? c - 1 : -1];
    for (let d = 0; d < 4; d++) {
      const t = cand[d];
      nbr[c * 4 + d] = t;
      if (t >= 0 && board.tiles[t] === Tile.Floor && (board.oneway[t] < 0 || board.oneway[t] === d)) enter[c * 4 + d] = 1;
    }
  }
  const len = (gi: number) => (gi < np ? presets[gi].length : maxRecord);
  /** 被抹除的影子：位置记成 GONE，指令指针视为走完 */
  const GONE = 0xffff;

  // ---- 当前正在模拟的状态（可变）----
  let P = 0;
  const B = new Int32Array(nb);
  let ng = 0;
  const GP = new Int32Array(np + maxGhosts + 1);
  const GI = new Int32Array(np + maxGhosts + 1);
  const GW = new Uint8Array(np + maxGhosts + 1); // 待命中
  const WAITBIT = 0x8000; // 编码时把“待命”塞进位置的最高位
  let BR = 0; // 已塌的裂地（位掩码）
  let bad = false;

  const occAny = (t: number): boolean => {
    if (P === t) return true;
    for (let i = 0; i < nb; i++) if (B[i] === t) return true;
    for (let i = 0; i < ng; i++) if (GP[i] === t) return true;
    return false;
  };
  const doorOpen = (ch: number): boolean => {
    if (board.plates[P] === ch) return true;
    for (let i = 0; i < nb; i++) if (board.plates[B[i]] === ch) return true;
    for (let i = 0; i < ng; i++) if (board.plates[GP[i]] === ch) return true;
    return false;
  };
  /** 从 from 朝 d 走一格的落点（穿过传送门）；越界 -1 */
  const dest = (from: number, d: number): number => {
    const t = nbr[from * 4 + d];
    return t >= 0 && board.portal[t] >= 0 ? board.portal[t] : t;
  };
  /** 种类 k（0 玩家 1 箱子 2 影子）能否从方向 d 进入 t */
  const canEnter = (t: number, d: number, k: number): boolean => {
    if (t < 0 || board.tiles[t] !== Tile.Floor) return false;
    const ow = board.oneway[t];
    if (ow >= 0 && ow !== d) return false;
    const gate = board.gates[t];
    if (gate === GATE_PAST && k !== 2) return false;
    if (gate === GATE_NOW && k !== 0) return false;
    if ((k !== 2 || forbidErase) && isPit(t)) return false;
    const door = board.doors[t];
    if (door && !doorOpen(door) && !occAny(t)) return false;
    return true;
  };
  const isPit = (t: number): boolean => {
    const ck = board.cracked[t];
    return ck >= 0 && (BR & (1 << ck)) !== 0;
  };
  // mover: -1 玩家，0..nb-1 箱子，1000+gi 影子
  const tryMove = (mover: number, d: number): boolean => {
    const from = mover === -1 ? P : mover >= 1000 ? GP[mover - 1000] : B[mover];
    const mk = mover === -1 ? 0 : mover >= 1000 ? 2 : 1;
    const t = dest(from, d);
    if (t === from || !canEnter(t, d, mk)) return false;
    const pushP = P === t && mover !== -1;
    let any = pushP;
    for (let i = 0; i < nb && !any; i++) if (B[i] === t && mover !== i) any = true;
    for (let i = 0; i < ng && !any; i++) if (GP[i] === t && mover !== 1000 + i) any = true;
    if (any) {
      if (mk === 1) return blocked(mover);
      const t2 = dest(t, d);
      if (t2 === t || t2 === from || occAny(t2)) return blocked(mover);
      if (pushP && !canEnter(t2, d, 0)) return blocked(mover);
      for (let i = 0; i < nb; i++) if (B[i] === t && mover !== i && !canEnter(t2, d, 1)) return blocked(mover);
      for (let i = 0; i < ng; i++) if (GP[i] === t && mover !== 1000 + i && !canEnter(t2, d, 2)) return blocked(mover);
      if (pushP) {
        if (forbidPush[mk * 3]) bad = true;
        P = t2;
      }
      for (let i = 0; i < nb; i++) if (B[i] === t && mover !== i) {
        if (forbidPush[mk * 3 + 1]) bad = true;
        B[i] = t2;
      }
      for (let i = 0; i < ng; i++) if (GP[i] === t && mover !== 1000 + i) {
        if (forbidPush[mk * 3 + 2]) bad = true;
        GP[i] = isPit(t2) ? GONE : t2;
      }
    }
    if (mover === -1) P = t;
    else if (mover >= 1000) GP[mover - 1000] = isPit(t) ? GONE : t;
    else B[mover] = t;
    const ck = board.cracked[from];
    if (ck >= 0 && !occAny(from)) BR |= 1 << ck;
    return true;
  };
  const blocked = (mover: number): false => {
    if (forbidBlock && mover >= 1000) bad = true;
    return false;
  };

  // ---- 状态编码：字符串，每个数字一个 UTF-16 码元 ----
  const encode = (): string => {
    const sorted = Array.from(B).sort((a, b) => a - b);
    let k = String.fromCharCode(P, BR & 0x7fff, BR >>> 15);
    for (let i = 0; i < nb; i++) k += String.fromCharCode(sorted[i]);
    for (let i = 0; i < ng; i++) k += String.fromCharCode(GP[i] === GONE ? GONE : GP[i] | (GW[i] ? WAITBIT : 0), GP[i] === GONE ? len(i) : Math.min(GI[i], len(i)));
    return k;
  };
  const decode = (k: string): void => {
    P = k.charCodeAt(0);
    BR = k.charCodeAt(1) | (k.charCodeAt(2) << 15);
    for (let i = 0; i < nb; i++) B[i] = k.charCodeAt(3 + i);
    ng = (k.length - 3 - nb) / 2;
    for (let i = 0; i < ng; i++) {
      const p = k.charCodeAt(3 + nb + i * 2);
      GW[i] = p !== GONE && p & WAITBIT ? 1 : 0;
      GP[i] = p === GONE ? GONE : p & ~WAITBIT;
      GI[i] = k.charCodeAt(4 + nb + i * 2);
    }
  };
  const won = (): boolean => {
    if (board.goalCount > 0) {
      let c = 0;
      for (let i = 0; i < nb; i++) if (board.goals[B[i]]) c++;
      if (c < board.goalCount) return false;
    }
    if (board.hasExit && !board.exits[P]) return false;
    return board.goalCount > 0 || board.hasExit;
  };
  // ---- 搜索 ----
  P = world.player;
  BR = world.broken;
  B.set(world.boxes);
  ng = np;
  for (let i = 0; i < np; i++) {
    GP[i] = world.ghosts[i].pos;
    GI[i] = 0;
    GW[i] = world.ghosts[i].waiting ? 1 : 0;
  }
  /** 释放：这一步开始时释放板上有东西，待命的影子都开始走（和 sim.ts 的 isReleasing 一致） */
  const releaseNow = () => {
    let on = board.release[P] === 1;
    for (let i = 0; i < nb && !on; i++) if (board.release[B[i]]) on = true;
    for (let i = 0; i < ng && !on; i++) if (GP[i] !== GONE && board.release[GP[i]]) on = true;
    if (on) for (let i = 0; i < ng; i++) GW[i] = 0;
  };
  const keys: string[] = [encode()];
  const parent: number[] = [-1];
  const via: number[] = [0]; // -1 = 新建影子；否则为本步的选择编码
  const seen = new Map<string, number>([[keys[0], 0]]);
  if (won()) return finish(0);

  let head = 0;
  let cur = 0; // 正在展开的节点（新节点的父亲）
  let found = -1;
  const done: Uint8Array[] = [];
  const isDone = (id: number) => (done[id >> 16]?.[id & 0xffff] ?? 0) === 1;
  const markDone = (id: number) => ((done[id >> 16] ??= new Uint8Array(65536))[id & 0xffff] = 1);
  let anyActive = false;
  // 每层递归的现场快照
  const depth = np + maxGhosts + 2;
  const sP = new Int32Array(depth);
  const sB = Array.from({ length: depth }, () => new Int32Array(nb));
  const sG = Array.from({ length: depth }, () => new Int32Array(depth));
  const sBad = new Uint8Array(depth);
  const sBR = new Int32Array(depth);
  const save = (d: number) => {
    sP[d] = P;
    sBR[d] = BR;
    sB[d].set(B);
    sG[d].set(GP.subarray(0, ng));
    sBad[d] = bad ? 1 : 0;
  };
  const restore = (d: number) => {
    P = sP[d];
    BR = sBR[d];
    B.set(sB[d]);
    GP.set(sG[d].subarray(0, ng));
    bad = sBad[d] === 1;
  };
  const add = (v: number): number => {
    if (bad) return -1;
    const k = encode();
    if (seen.has(k)) return -1;
    const id = keys.length;
    seen.set(k, id);
    keys.push(k);
    parent.push(cur);
    via.push(v);
    if (won()) found = id;
    return id;
  };

  const playerTurn = (code: number, mul: number) => {
    for (let k = 0; k < 5 && found < 0; k++) {
      const pc = CHOICE_ORDER[k];
      if (pc === WAIT ? !anyActive : !enter[P * 4 + pc]) continue;
      save(ng);
      if (pc !== WAIT) tryMove(-1, pc);
      add(code + pc * mul);
      restore(ng);
    }
  };
  const beat = (i: number, code: number, mul: number): void => {
    if (found >= 0) return;
    if (i === ng) return playerTurn(code, mul);
    const ip0 = GI[i];
    if (ip0 >= len(i) || GW[i]) return beat(i + 1, code, mul); // 演完了，或者待命中
    // 这一步里在轮到它之前就被推进坑了：不再动，但仍占一个选择位（记作原地等）
    if (GP[i] === GONE) return beat(i + 1, i < np ? code : code + WAIT * mul, i < np ? mul : mul * base);
    save(i);
    if (i < np) {
      const ins = presets[i][ip0];
      GI[i] = ip0 + 1;
      if (ins !== WAIT) tryMove(1000 + i, ins);
      beat(i + 1, code, mul);
      restore(i);
      GI[i] = ip0;
      return;
    }
    // 先试原地不动：同样长的解里优先“少动”，录像更好读
    for (let k = 0; k < base && found < 0; k++) {
      const c = CHOICE_ORDER[k];
      if (c === END) {
        if (ip0 === 0) continue; // 录像不能为空
        GI[i] = maxRecord;
      } else {
        GI[i] = ip0 + 1;
        // 往墙里走等同于原地不动，跳过
        if (c !== WAIT && !enter[GP[i] * 4 + c]) continue;
        if (c !== WAIT) tryMove(1000 + i, c);
      }
      beat(i + 1, code + c * mul, mul * base);
      restore(i);
    }
    GI[i] = ip0;
  };

  /**
   * 展开一个节点：先当场展开“在这里新建影子”得到的节点（不花步数，同一层处理），
   * 再展开这一步的所有走法。这样队列按步数单调，找到的解步数最少。
   */
  const expand = (id: number): void => {
    if (isDone(id) || found >= 0) return;
    markDone(id);
    decode(keys[id]);
    cur = id;
    const ng0 = ng;
    let child = -1;
    if (ng0 - np < maxGhosts) {
      let mid = false;
      if (forbidSlice) for (let i = 0; i < ng0; i++) if (GI[i] > 0 && GI[i] < len(i)) mid = true;
      if (!mid) {
        GP[ng0] = P;
        GI[ng0] = 0;
        GW[ng0] = board.hold[P];
        ng = ng0 + 1;
        child = add(-1); // 新建影子不会改变地图，不可能直接通关
        ng = ng0;
      }
    }
    anyActive = false;
    for (let i = 0; i < ng0; i++) if (GI[i] < len(i) && GP[i] !== GONE) anyActive = true;
    releaseNow();
    beat(0, 0, 1);
    if (child >= 0) expand(child);
  };

  for (; head < keys.length; head++) {
    expand(head);
    if (found >= 0) return finish(found);
    if (keys.length >= maxNodes) return { status: 'limit', nodes: keys.length };
    if (opts.onProgress && head % 50000 === 0) opts.onProgress(keys.length);
  }
  return { status: 'unsolvable', nodes: keys.length };

  /** 从搜索树还原动作串：把每个影子当场选的动作拼成录像 */
  function finish(id: number): SolveResult {
    const path: number[] = [];
    for (let c = id; c > 0; c = parent[c]) path.push(c);
    path.reverse();
    const programs: number[][] = [];
    const events: (number | { ghost: number })[] = [];
    for (const c of path) {
      decode(keys[parent[c]]);
      const v = via[c];
      if (v === -1) {
        events.push({ ghost: ng });
        programs[ng] = [];
        continue;
      }
      releaseNow();
      let code = v;
      for (let i = np; i < ng; i++) {
        if (GI[i] >= maxRecord || GW[i]) continue;
        const ch = code % base;
        code = Math.floor(code / base);
        if (ch !== END) programs[i].push(ch);
      }
      events.push(code);
    }
    const build = (trim: boolean) =>
      events
        .map((e) => {
          if (typeof e === 'number') return 'URDLW'[e];
          let p = programs[e.ghost].map((c) => 'URDLW'[c]).join('');
          if (trim) p = p.replace(/W+$/, '') || 'W';
          return '[' + p + ']';
        })
        .join('');
    const check = { ...def, maxGhosts, maxRecord };
    for (const sol of [build(true), build(false)]) {
      if (runActions(check, sol).won) return { status: 'solved', solution: sol, nodes: keys.length };
    }
    throw new Error('solver/sim mismatch: ' + build(false));
  }
}

/**
 * 星级目标：能通关的最少影子数，以及最少步数（步数不限影子数）。
 * 两项分开算，同一条解不一定同时做到。任何一项搜不完返回 null。
 */
export function computePar(def: Def, opts: SolveOptions = {}): Par | null {
  const full = solve(def, opts);
  if (full.status !== 'solved') return null;
  const steps = runActions(def, full.solution).state.world.tick;
  for (let k = 0; k <= def.maxGhosts; k++) {
    const r = k === def.maxGhosts ? full : solve(def, { ...opts, maxGhosts: k });
    if (r.status === 'limit') return null;
    if (r.status === 'solved') return { ghosts: k, steps };
  }
  return null;
}
