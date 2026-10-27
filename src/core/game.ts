import { parseLevel } from './level';
import { isActive, sameWorld, step } from './sim';
import { Board, Dir, GameState, Ghost, Instr, LevelDef, SimEvent, WAIT, World } from './types';

/*
 * 动作字符串编码（参考解、回放、求解器输出都用它）：
 *   U R D L  方向      W  等待
 *   [        开始录制（设置 Anchor）
 *   ]        封存：回到 Anchor，生成新 Ghost
 *   x        放弃本次录制，回到 Anchor
 */
export type Action = Dir | typeof WAIT | 'rec' | 'seal' | 'cancel';
export const ACTION_CHARS: Record<string, Action> = { U: 0, R: 1, D: 2, L: 3, W: WAIT, '[': 'rec', ']': 'seal', x: 'cancel' };

export function actionToChar(a: Action): string {
  if (a === 'rec') return '[';
  if (a === 'seal') return ']';
  if (a === 'cancel') return 'x';
  return 'URDLW'[a];
}

export function parseActions(s: string): Action[] {
  const out: Action[] = [];
  for (const c of s.replace(/\s+/g, '')) {
    const a = ACTION_CHARS[c];
    if (a === undefined) throw new Error(`unknown action char: ${c}`);
    out.push(a);
  }
  return out;
}

export interface Rules {
  maxGhosts: number;
  maxRecord: number;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: SimEvent[]; kind: 'beat' | 'rec' | 'seal' | 'cancel' }
  | { ok: false; reason: 'noop' | 'ghost-limit' | 'record-limit' | 'not-recording' | 'empty' };

/** 场上还在的、你自己留的影子数（不含残影；掉进坑被抹除的不算，名额会空出来） */
export function ownGhosts(w: World): number {
  let n = 0;
  for (const g of w.ghosts) if (!g.preset && !g.gone) n++;
  return n;
}

/** 这条时间线上你一共留过几个影子（含已被抹除的）。星级“最少影子”按这个算 */
export function usedGhosts(w: World): number {
  let n = 0;
  for (const g of w.ghosts) if (!g.preset) n++;
  return n;
}

export function initialState(world: World): GameState {
  return { world, rec: null };
}

export function applyAction(board: Board, rules: Rules, s: GameState, a: Action, light = false): ApplyResult {
  if (a === 'rec') {
    if (s.rec) return { ok: false, reason: 'not-recording' };
    if (ownGhosts(s.world) >= rules.maxGhosts) return { ok: false, reason: 'ghost-limit' };
    return {
      ok: true,
      kind: 'rec',
      events: [],
      state: { world: s.world, rec: { anchor: s.world, inputs: [], path: [s.world.player] } },
    };
  }
  if (a === 'seal' || a === 'cancel') {
    if (!s.rec) return { ok: false, reason: 'not-recording' };
    const anchor = s.rec.anchor;
    if (a === 'cancel' || s.rec.inputs.length === 0) {
      return { ok: true, kind: 'cancel', events: [], state: { world: anchor, rec: null } };
    }
    const ghost: Ghost = {
      id: anchor.ghosts.length,
      pos: anchor.player,
      program: s.rec.inputs,
      ip: 0,
      recPath: s.rec.path,
      log: [],
      born: anchor.tick,
      waiting: board.hold[anchor.player] === 1,
    };
    return {
      ok: true,
      kind: 'seal',
      events: [],
      state: { world: { ...anchor, ghosts: [...anchor.ghosts, ghost] }, rec: null },
    };
  }

  const instr = a as Instr;
  if (s.rec && s.rec.inputs.length >= rules.maxRecord) return { ok: false, reason: 'record-limit' };
  const out = step(board, s.world, instr, { light });
  if (!s.rec) {
    // 不在录制、世界毫无变化（比如撞墙且没有活动的 Ghost）：忽略这次输入
    const anyActive = s.world.ghosts.some(isActive);
    if (!anyActive && sameWorld(s.world, out.world)) return { ok: false, reason: 'noop' };
    const world = light ? out.world : { ...out.world, inputs: [...s.world.inputs, instr] };
    return { ok: true, kind: 'beat', events: out.events, state: { world, rec: null } };
  }
  const rec = { anchor: s.rec.anchor, inputs: [...s.rec.inputs, instr], path: [...s.rec.path, out.world.player] };
  return { ok: true, kind: 'beat', events: out.events, state: { world: out.world, rec } };
}

export function isWon(board: Board, s: GameState): boolean {
  if (s.rec) return false;
  const w = s.world;
  if (board.goalCount > 0) {
    let covered = 0;
    for (const b of w.boxes) if (board.goals[b]) covered++;
    if (covered < board.goalCount) return false;
  }
  if (board.hasExit && !board.exits[w.player]) return false;
  return board.goalCount > 0 || board.hasExit;
}

/** 运行一串动作，返回最终状态与是否通关（无效动作视为失败） */
export function runActions(def: Pick<LevelDef, 'map' | 'presets' | 'maxGhosts' | 'maxRecord'>, actions: string | Action[]) {
  const { board, world } = parseLevel(def);
  const list = typeof actions === 'string' ? parseActions(actions) : actions;
  let s = initialState(world);
  for (let i = 0; i < list.length; i++) {
    const r = applyAction(board, def, s, list[i]);
    if (!r.ok) return { ok: false as const, failedAt: i, reason: r.reason, state: s, won: false, board };
    s = r.state;
  }
  return { ok: true as const, state: s, won: isWon(board, s), board };
}

export interface ReplayFrame {
  world: World;
  events: SimEvent[];
}

/**
 * 把通关时的最终时间线从头重放一遍：影子在各自出生的那一步出现，你按 world.inputs 走。
 * 用来做过关后的“原本打算 vs 实际发生”对比。
 */
export function replayTimeline(board: Board, initial: World, final: World): ReplayFrame[] {
  const own = final.ghosts.filter((g) => !g.preset);
  let w: World = { ...initial, ghosts: initial.ghosts.map((g) => ({ ...g })) };
  const spawn = (tick: number) => {
    for (const g of own) {
      if (g.born !== tick) continue;
      w = { ...w, ghosts: [...w.ghosts, { ...g, pos: g.recPath[0], ip: 0, log: [], gone: false, waiting: board.hold[g.recPath[0]] === 1 }] };
    }
  };
  spawn(0);
  const frames: ReplayFrame[] = [{ world: w, events: [] }];
  for (let t = 0; t < final.inputs.length; t++) {
    const out = step(board, w, final.inputs[t]);
    w = { ...out.world, inputs: final.inputs.slice(0, t + 1) };
    spawn(t + 1);
    frames.push({ world: w, events: out.events });
  }
  return frames;
}

/** 有撤销栈的游戏会话，供 UI 使用 */
export class Session {
  readonly board: Board;
  readonly initial: World;
  state: GameState;
  history: GameState[] = [];
  /** 与 history 一一对应；'restart' 表示一次重开 */
  actions: (Action | 'restart')[] = [];
  won = false;

  constructor(readonly def: LevelDef) {
    const p = parseLevel(def);
    this.board = p.board;
    this.initial = p.world;
    this.state = initialState(p.world);
  }

  get rules(): Rules {
    return this.def;
  }

  act(a: Action): ApplyResult {
    if (this.won) return { ok: false, reason: 'noop' };
    const r = applyAction(this.board, this.rules, this.state, a);
    if (r.ok) {
      this.history.push(this.state);
      this.actions.push(a);
      this.state = r.state;
      this.won = isWon(this.board, this.state);
    }
    return r;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.actions.pop();
    this.state = prev;
    this.won = false;
    return true;
  }

  restart(): void {
    if (this.history.length === 0) return;
    this.history.push(this.state);
    this.actions.push('restart');
    this.state = initialState(this.initial);
    this.won = false;
  }

  /** 用于“清除所有 Ghost”式彻底重来：清空撤销栈 */
  hardReset(): void {
    this.history = [];
    this.actions = [];
    this.state = initialState(this.initial);
    this.won = false;
  }

  /** 自最后一次重开以来的动作串 */
  solutionString(): string {
    const i = this.actions.lastIndexOf('restart');
    return (this.actions.slice(i + 1) as Action[]).map(actionToChar).join('');
  }
}
