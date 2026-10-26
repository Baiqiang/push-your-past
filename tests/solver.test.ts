import { describe, expect, it } from 'vitest';
import { Action, applyAction, initialState, isWon, runActions } from '../src/core/game';
import { parseLevel } from '../src/core/level';
import { solve, solveWithoutGhosts } from '../src/core/solver';
import { GameState, WAIT } from '../src/core/types';

type Def = { map: string[]; presets?: string[]; maxGhosts: number; maxRecord: number };

/**
 * 参照实现：直接枚举真实动作（含完整留影内容）的暴力搜索，穷举所有可达状态。
 * 返回通关时最终时间线上的最少步数（world.tick）；无解 -1，超限 null。
 * 注意不能按“走了几下”算：留影里走的步会随回溯一起作废。
 */
function bruteMinSteps(def: Def, maxNodes = 400_000): number | null {
  const { board, world } = parseLevel(def);
  const key = (s: GameState) => {
    const w = s.world;
    let k = w.player + '|' + w.broken + '|' + [...w.boxes].sort((a, b) => a - b).join(',');
    for (const g of w.ghosts) k += '|' + g.pos + ':' + g.ip + ':' + (g.waiting ? 'w' : '') + g.program.join('');
    if (s.rec) k += '#' + s.rec.anchor.player + ':' + s.rec.anchor.broken + ':' + s.rec.anchor.boxes.join(',') + ':' + s.rec.anchor.ghosts.map((g) => g.pos + '/' + g.ip + (g.waiting ? 'w' : '')).join(',') + ':' + s.rec.inputs.join('');
    return k;
  };
  const start = initialState(world);
  const seen = new Set([key(start)]);
  const queue = [start];
  const acts: Action[] = [0, 1, 2, 3, WAIT, 'rec', 'seal'];
  let best = -1;
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    if (isWon(board, s)) {
      if (best < 0 || s.world.tick < best) best = s.world.tick;
      continue;
    }
    for (const a of acts) {
      const r = applyAction(board, def, s, a, true);
      if (!r.ok) continue;
      const k = key(r.state);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(r.state);
      if (queue.length > maxNodes) return null;
    }
  }
  return best;
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** 随机小地图：内部 w×h，带墙、箱子、目标、压力板、门、出口、单向格，偶尔有一个预设影子 */
function randomLevel(r: () => number): Def {
  const w = 3 + Math.floor(r() * 3);
  const h = 2 + Math.floor(r() * 2);
  const cells: string[] = [];
  for (let i = 0; i < w * h; i++) cells.push(r() < 0.18 ? '#' : '.');
  const free = () => {
    for (let t = 0; t < 50; t++) {
      const i = Math.floor(r() * w * h);
      if (cells[i] === '.') return i;
    }
    return -1;
  };
  const put = (c: string) => {
    const i = free();
    if (i >= 0) cells[i] = c;
  };
  put('@');
  if (!cells.includes('@')) cells[0] = '@';
  if (r() < 0.5) put('E');
  else {
    put('$');
    put('_');
  }
  if (r() < 0.7) {
    put('a');
    put('A');
  }
  if (r() < 0.3) put('$');
  if (r() < 0.25) put('>^v<'[Math.floor(r() * 4)]);
  if (r() < 0.2) put(r() < 0.5 ? 'S' : 'Y');
  if (r() < 0.3) {
    put('H');
    put('r');
  }
  if (r() < 0.4) put('%');
  if (r() < 0.25) put('%');
  if (r() < 0.2) {
    const before = cells.join('');
    put('(');
    if (cells.join('') !== before) {
      const b2 = cells.join('');
      put(')');
      if (cells.join('') === b2) cells[cells.indexOf('(')] = '.';
    }
  }
  let presets: string[] | undefined;
  if (r() < 0.3) {
    const before = cells.join('');
    put('1');
    if (cells.join('') !== before) presets = [(r() < 0.25 ? '⏸' : r() < 0.35 ? '▶' : '') + Array.from({ length: 1 + Math.floor(r() * 3) }, () => 'URDLW'[Math.floor(r() * 5)]).join('')];
  }
  const rows = ['#'.repeat(w + 2)];
  for (let y = 0; y < h; y++) rows.push('#' + cells.slice(y * w, y * w + w).join('') + '#');
  rows.push('#'.repeat(w + 2));
  return { map: rows, presets, maxGhosts: 1 + Math.floor(r() * 2), maxRecord: 1 + Math.floor(r() * 3) };
}

describe('求解器', () => {
  it('与暴力搜索对拍：有没有解、最少几步都一致，解能回放通关', () => {
    const r = rng(20261024);
    let compared = 0;
    let solvedCount = 0;
    for (let n = 0; n < 300; n++) {
      const def = randomLevel(r);
      const ref = bruteMinSteps(def, 120_000);
      if (ref === null) continue;
      const got = solve(def, { maxNodes: 2_000_000 });
      const tag = JSON.stringify(def);
      expect(got.status, tag).toBe(ref >= 0 ? 'solved' : 'unsolvable');
      if (got.status === 'solved') {
        const run = runActions(def, got.solution);
        expect(run.won, got.solution).toBe(true);
        expect(run.state.world.tick, tag + ' ' + got.solution).toBe(ref);
        solvedCount++;
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(200);
    expect(solvedCount).toBeGreaterThan(50);
  }, 300_000);

  it('门 + 压力板：不录影子无解，录一个可解', () => {
    const def = { map: ['#######', '#@a#..#', '#..A.E#', '#######'], maxGhosts: 1, maxRecord: 6 };
    expect(solveWithoutGhosts(def).status).toBe('unsolvable');
    const s = solve(def);
    expect(s.status).toBe('solved');
  });

  it('预设影子照常回放；不录影子时它仍然在场', () => {
    // 预设影子先等一步再踩上 a，玩家趁门开走过去
    const def = { map: ['#######', '#1a#..#', '#@.A.E#', '#######'], presets: ['WRWWWWWW'], maxGhosts: 0, maxRecord: 1 };
    const s = solveWithoutGhosts(def);
    expect(s.status).toBe('solved');
  });

  it('消融选项：禁止玩家推影子后无解', () => {
    // 必须把影子推进门里卡住门
    const def = { map: ['###########', '#a@.Ab.BE.#', '###########'], maxGhosts: 1, maxRecord: 4 };
    expect(solve(def).status).toBe('solved');
    expect(solve(def, { forbidPush: ['p>g'] }).status).toBe('unsolvable');
  });
});
