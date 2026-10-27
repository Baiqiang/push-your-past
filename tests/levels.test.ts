import { describe, expect, it } from 'vitest';
import { runActions, Action, applyAction, initialState, isWon, parseActions } from '../src/core/game';
import { parseLevel } from '../src/core/level';
import { computePar, solve, SolveOptions, solveWithoutGhosts } from '../src/core/solver';
import { DX, DY, GameState, LevelDef, WAIT } from '../src/core/types';
import { LEVEL_TEXT_EN } from '../src/i18n/levels.en';
import { CHAPTERS, LEVELS } from '../src/levels';

/**
 * 回放参考解，统计最终真实历史（不含留影期间）中的交互：
 *   pushes: 'p>g0' 玩家推 g0，'g1>p' g1 推玩家，箱子统一记作 b
 *   blocks: 'g0<p' g0 的一步被玩家挡住（wall 表示墙 / 关着的门 / 单向格）
 *   slices: 在已有 Ghost 执行到中途时开始录制的次数
 */
function replay(def: LevelDef) {
  const { board, world } = parseLevel(def);
  let s: GameState = initialState(world);
  const pushes: string[] = [];
  const blocks: string[] = [];
  let slices = 0;
  let released = 0;
  // 受控残影每一步走没走：m 走了，. 没走（▶ 没压着）
  const gatedTrace: Record<number, string> = {};
  const norm = (id: string) => (id[0] === 'b' ? 'b' : id);
  for (const a of parseActions(def.solution ?? '')) {
    if (a === 'rec' && s.world.ghosts.some((g) => g.ip > 0 && g.ip < g.program.length)) slices++;
    const before = s.world;
    const r = applyAction(board, def, s, a);
    if (!r.ok) throw new Error(`${def.id}: 动作 ${a} 无效 (${r.reason})`);
    if (r.kind === 'beat' && !r.state.rec) {
      before.ghosts.forEach((g, i) => {
        if (!g.gated || g.ip >= g.program.length) return;
        gatedTrace[i] = (gatedTrace[i] ?? '') + (r.state.world.ghosts[i].ip > g.ip ? 'm' : '.');
      });
      const pos = new Map<string, number>([['p', before.player]]);
      before.boxes.forEach((b, k) => pos.set('b' + k, b));
      before.ghosts.forEach((g) => pos.set('g' + g.id, g.pos));
      let pending: string[] = [];
      for (const e of r.events) {
        if (e.t === 'release') released++;
        if (e.t === 'move') {
          pos.set(e.id, e.to);
          if (e.pushed) pending.push(e.id);
          else {
            for (const p of pending) pushes.push(norm(e.id) + '>' + norm(p));
            pending = [];
          }
        } else if (e.t === 'bump' && e.id[0] === 'g') {
          const t = (Math.floor(e.at / board.w) + DY[e.dir]) * board.w + (e.at % board.w) + DX[e.dir];
          const occ = [...pos].filter(([id, p]) => p === t && id !== e.id).map(([id]) => norm(id));
          blocks.push(e.id + '<' + (occ.length ? occ.join('+') : 'wall'));
        }
      }
    }
    s = r.state;
  }
  // 半路停过：先走了至少一步，之后有一步没走，再之后又走了；
  // 或者走了几步就停住，到通关时动作还没走完（停在半路当墙，12-2 就是这样）
  const pausedMidway = Object.entries(gatedTrace).some(([i, tr]) => {
    const g = s.world.ghosts[+i];
    return /m\.+m/.test(tr) || (/m\./.test(tr) && g.ip < g.program.length);
  });
  return { won: isWon(board, s), ghosts: s.world.ghosts.length, gone: s.world.ghosts.filter((g) => g.gone).length, released, pausedMidway, pushes, blocks, slices };
}

/** 每章的核心交互：参考解里要出现（sanity），且关掉它以后求解器证明无解（必要性） */
const CHAPTER_CHECK: Record<number, [string, (t: ReturnType<typeof replay>) => boolean, SolveOptions[]]> = {
  1: ['录影子', (t) => t.ghosts >= 1, []],
  2: ['推影子', (t) => t.pushes.some((p) => /^p>g\d$/.test(p)), [{ forbidPush: ['p>g'] }]],
  3: ['影子推你', (t) => t.pushes.some((p) => /^g\d>p$/.test(p)), [{ forbidPush: ['g>p'] }]],
  4: ['影子推影子', (t) => t.pushes.some((p) => /^g\d>g\d$/.test(p)), [{ forbidPush: ['g>g'] }]],
  5: ['挡住残影的一步', (t) => t.blocks.some((b) => /^g\d<.*[pbg]/.test(b)), [{ forbidBlock: true }]],
  6: ['影子演到一半时开始录', (t) => t.slices >= 1, [{ forbidSlice: true }]],
  7: [
    '你推影子，影子再推影子',
    (t) => {
      const pg = t.pushes.filter((p) => /^p>g\d$/.test(p)).map((p) => p.slice(2));
      const gg = t.pushes.filter((p) => /^g\d>g\d$/.test(p)).map((p) => p.split('>'));
      return gg.some(([a, b]) => pg.includes(a) || pg.includes(b));
    },
    [{ forbidPush: ['p>g'] }, { forbidPush: ['g>g'] }],
  ],
  8: ['身份闸', (t) => t.ghosts >= 1, []],
  9: ['影子落坑被抹除', (t) => t.gone >= 1, []],
  10: ['传送门', (t) => t.ghosts >= 1, []],
  11: ['待命的影子被释放板放出来', (t) => t.released >= 1, []],
  12: ['受控残影半路停下', (t) => t.pausedMidway, []],
};

/**
 * 第 8-10 章的机关是地图格子，用“替换格子”做消融：替换后必须无解（或明显更难）。
 *   S / Y 换成墙：证明这扇闸必须有人通过；Y 换成地板：证明它挡住残影是必需的。
 *   % 换成墙：证明裂地必须走过；% 换成地板：塌陷本身有用（无解或最少步数变多）。
 *   传送门换成墙 / 地板：证明非穿门不可。
 */
type MapAbl = { from: string; to: string; expect: 'unsolvable' | 'harder' };
const MAP_ABL: Record<string, MapAbl[]> = {
  '8-1': [{ from: 'S', to: '#', expect: 'unsolvable' }],
  '8-2': [{ from: 'Y', to: '.', expect: 'unsolvable' }, { from: 'Y', to: '#', expect: 'unsolvable' }],
  '8-3': [{ from: 'S', to: '#', expect: 'unsolvable' }, { from: 'Y', to: '#', expect: 'unsolvable' }],
  '9-1': [{ from: '%', to: '#', expect: 'unsolvable' }, { from: '%', to: '.', expect: 'unsolvable' }],
  '9-2': [{ from: '%', to: '#', expect: 'unsolvable' }, { from: '%', to: '.', expect: 'unsolvable' }],
  '9-3': [{ from: '%', to: '#', expect: 'unsolvable' }],
  '9-4': [{ from: '%', to: '#', expect: 'unsolvable' }, { from: '%', to: '.', expect: 'unsolvable' }],
  '10-1': [{ from: '()', to: '#', expect: 'unsolvable' }, { from: '()', to: '.', expect: 'unsolvable' }],
  '10-2': [{ from: '()', to: '#', expect: 'unsolvable' }, { from: '()', to: '.', expect: 'unsolvable' }],
  // H 换成地板：影子回溯后立刻出发（相当于只能在留影里等，受步数上限限制）；r 换成地板：影子永远不出发
  '11-1': [{ from: 'H', to: '.', expect: 'unsolvable' }, { from: 'r', to: '.', expect: 'unsolvable' }],
  '11-2': [{ from: 'H', to: '.', expect: 'unsolvable' }, { from: 'r', to: '.', expect: 'unsolvable' }],
  '11-3': [{ from: 'H', to: '.', expect: 'unsolvable' }, { from: 'r', to: '.', expect: 'unsolvable' }],
  // r 换成地板：受控残影永远不走
  '12-1': [{ from: 'r', to: '.', expect: 'unsolvable' }],
  '12-2': [{ from: 'r', to: '.', expect: 'unsolvable' }, { from: 'Y', to: '#', expect: 'unsolvable' }],
  '12-3': [{ from: 'r', to: '.', expect: 'unsolvable' }, { from: 'Y', to: '#', expect: 'unsolvable' }],
};
const substitute = (map: string[], from: string, to: string) => map.map((r) => [...r].map((c) => (from.includes(c) ? to : c)).join(''));

describe('关卡结构', () => {
  it('id 唯一且与章节一致', () => {
    const ids = new Set(LEVELS.map((l) => l.id));
    expect(ids.size).toBe(LEVELS.length);
    for (const l of LEVELS) expect(l.id.startsWith(l.chapter + '-')).toBe(true);
  });

  it('每章都有关卡', () => {
    for (const c of CHAPTERS) expect(LEVELS.some((l) => l.chapter === c.id)).toBe(true);
  });

  it('地图为矩形且有边框，限制合理', () => {
    for (const l of LEVELS) {
      const w = l.map[0].length;
      for (const r of l.map) expect(r.length, l.id).toBe(w);
      expect(l.map[0]).toMatch(/^#+$/);
      expect(l.map[l.map.length - 1]).toMatch(/^#+$/);
      expect(w).toBeLessThanOrEqual(14);
      expect(l.map.length).toBeLessThanOrEqual(9);
      expect(l.maxGhosts).toBeGreaterThanOrEqual(l.presets?.length ? 0 : 1);
      expect(l.maxRecord).toBeGreaterThan(0);
      expect(l.hint).toBeTruthy();
      expect(l.solution).toBeTruthy();
      expect(l.par, l.id).toBeTruthy();
    }
  });

  it('第 8 章起每关都有地图消融', () => {
    for (const l of LEVELS) if (l.chapter >= 8) expect(MAP_ABL[l.id]?.length, l.id).toBeGreaterThan(0);
  });

  it('每关都有英文名称和提示', () => {
    for (const l of LEVELS) {
      expect(LEVEL_TEXT_EN[l.id]?.name, l.id).toBeTruthy();
      expect(LEVEL_TEXT_EN[l.id]?.hint, l.id).toBeTruthy();
    }
    expect(Object.keys(LEVEL_TEXT_EN).sort()).toEqual(LEVELS.map((l) => l.id).sort());
  });

  it('每关都有分步提示，中英文条数一致', () => {
    for (const l of LEVELS) {
      expect(l.hints?.length ?? 0, l.id).toBeGreaterThanOrEqual(2);
      expect(LEVEL_TEXT_EN[l.id]?.hints?.length, l.id).toBe(l.hints!.length);
    }
  });

  it('文案不用术语', () => {
    for (const l of LEVELS) expect(l.name + l.hint + (l.hints ?? []).join(''), l.id).not.toMatch(/拍|指令|Ghost|锚点|封存|录|收束/);
    // 文案只描述玩家看得到的东西：不出现 S / Y / % / ( ) 这些只在地图源码里的字符
    for (const l of LEVELS) expect(l.hint + (l.hints ?? []).join(''), l.id).not.toMatch(/(?<![A-Za-z])[SY](?![A-Za-z])|[%()]/);
    for (const [id, e] of Object.entries(LEVEL_TEXT_EN)) expect(e.hint + ' ' + (e.hints ?? []).join(' '), id).not.toMatch(/(?<![A-Za-z])[SY](?![A-Za-z])|[%()]/);
    // 门和机关按颜色说（地图上只看得到颜色），不出现字母 A / a 这类说法
    for (const l of LEVELS) expect(l.hint + (l.hints ?? []).join(''), l.id).not.toMatch(/(?<![A-Za-z])[a-dA-D](?![A-Za-z])/);
    // 英文：A / a 也是冠词，所以只查“door A”“plate a”以及单独的 b、c、B、C、D
    for (const [id, e] of Object.entries(LEVEL_TEXT_EN)) {
      const txt = e.hint + ' ' + (e.hints ?? []).join(' ');
      expect(txt, id).not.toMatch(/\b(door|plate) [a-dA-D]\b|(?<![A-Za-z\\])[b-dB-D](?![A-Za-z])/i);
    }
    // 待命台 / 释放板在文案里用 ⏸ / ▶ 表示，不出现地图字母 H、r
    for (const l of LEVELS) expect(l.hint + (l.hints ?? []).join(''), l.id).not.toMatch(/(?<![A-Za-z])[Hr](?![A-Za-z])/);
    for (const [id, e] of Object.entries(LEVEL_TEXT_EN)) expect(e.hint + (e.hints ?? []).join(' '), id).not.toMatch(/(?<![A-Za-z])[Hr](?![A-Za-z])/);
    for (const e of Object.values(LEVEL_TEXT_EN)) expect(e.name + e.hint + (e.hints ?? []).join(' ')).not.toMatch(/record|resolv/i);
  });
});

/**
 * 暴力搜索：不允许任何影子被抹除（出现抹除的那一步直接剪掉）时，还能不能过。
 * 第 9 章用它证明“落坑抹除”是必需的：把裂地换成地板会顺带给你和箱子多一条路，不够干净。
 */
function solvableWithoutErase(def: LevelDef, maxNodes = 3_000_000): boolean | null {
  const { board, world } = parseLevel(def);
  const key = (s: GameState) => {
    const w = s.world;
    let k = w.player + '|' + w.broken + '|' + [...w.boxes].sort((a, b) => a - b).join(',');
    for (const g of w.ghosts) k += '|' + g.pos + ':' + g.ip + ':' + g.program.join('');
    if (s.rec) k += '#' + s.rec.anchor.player + ':' + s.rec.anchor.broken + ':' + s.rec.anchor.boxes.join(',') + ':' + s.rec.anchor.ghosts.map((g) => g.pos + '/' + g.ip).join(',') + ':' + s.rec.inputs.join('');
    return k;
  };
  const start = initialState(world);
  const seen = new Set([key(start)]);
  const queue = [start];
  const acts: Action[] = [0, 1, 2, 3, WAIT, 'rec', 'seal'];
  for (let i = 0; i < queue.length; i++) {
    if (isWon(board, queue[i])) return true;
    for (const a of acts) {
      const r = applyAction(board, def, queue[i], a, true);
      if (!r.ok || r.state.world.ghosts.some((g) => g.gone)) continue;
      const k = key(r.state);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(r.state);
      if (queue.length > maxNodes) return null;
    }
  }
  return false;
}

describe.each(LEVELS.filter((l) => l.chapter === 9).map((l) => [l.id, l] as const))('第 9 章 %s：落坑抹除是必需的', (_id, level) => {
  it('不允许抹除影子时无解', () => {
    // 9-4 每段能留 6 步，暴力枚举录像内容搜不完；它只用求解器的 forbidErase（已和暴力搜索在小图上对拍过）
    if (level.id !== '9-4') expect(solvableWithoutErase(level)).toBe(false);
    // 求解器的 forbidErase 选项与暴力搜索结论一致
    expect(solve(level, { forbidErase: true }).status).toBe('unsolvable');
  });
  it('什么都不做时残影不会自己掉进坑（抹除是你造成的）', () => {
    const r = replayIdle(level);
    expect(r).toBe(false);
  });
});

/** 一直原地等，看有没有影子掉进坑 */
function replayIdle(def: LevelDef): boolean {
  const { board, world } = parseLevel(def);
  let s: GameState = initialState(world);
  for (let k = 0; k < 40; k++) {
    const r = applyAction(board, def, s, WAIT, true);
    if (!r.ok) break;
    s = r.state;
  }
  return s.world.ghosts.some((g) => g.gone);
}

/** 释放那一步开始时，释放板上是谁：p 你、e 残影、g 你留的影子、b 箱子 */
function releasers(def: LevelDef): string[] {
  const { board, world } = parseLevel(def);
  let s: GameState = initialState(world);
  const who: string[] = [];
  for (const a of parseActions(def.solution ?? '')) {
    const before = s.world;
    const r = applyAction(board, def, s, a);
    if (!r.ok) throw new Error(`${def.id}: 动作 ${String(a)} 无效`);
    if (r.kind === 'beat' && !r.state.rec && r.events.some((e) => e.t === 'release')) {
      if (board.release[before.player]) who.push('p');
      for (const b of before.boxes) if (board.release[b]) who.push('b');
      for (const g of before.ghosts) if (g.pos >= 0 && board.release[g.pos]) who.push(g.preset ? 'e' : 'g');
    }
    s = r.state;
  }
  return who;
}

// 第 12 章：“半路停下”是必需的。去掉 ▶ 前缀（一开局就走、不停）或换成 ⏸（只能决定何时出发、出发后不停）都无解
describe.each(LEVELS.filter((l) => l.chapter === 12).map((l) => [l.id, l] as const))('第 12 章 %s：受控残影必须半路停', (_id, level) => {
  const swap = (to: string) => ({ ...level, presets: level.presets!.map((p) => (p.startsWith('▶') ? to + p.slice(1) : p)) });
  it('有受控残影', () => {
    expect(level.presets!.some((p) => p.startsWith('▶'))).toBe(true);
  });
  it('换成照常出发的残影就无解', () => {
    expect(solve(swap('')).status).toBe('unsolvable');
  });
  it('换成只能等一次的残影（⏸）也无解', () => {
    expect(solve(swap('⏸')).status).toBe('unsolvable');
  });
});


describe('9-4：影子掉坑后名额空出来，可以再留一个', () => {
  const l = () => LEVELS.find((x) => x.id === '9-4')!;
  it('不允许回收名额就无解', () => {
    expect(solve(l(), { forbidRecycle: true }).status).toBe('unsolvable');
  });
  it('参考解里第一个影子掉坑被抹除，之后又留了第二个', () => {
    const w = runActions(l(), l().solution!).state.world;
    const own = w.ghosts.filter((g) => !g.preset);
    expect(own.length).toBe(2);
    expect(own[0].gone).toBe(true);
    expect(own[1].born).toBeGreaterThan(0);
  });
});

describe('第 12 章：受控残影要和推 / 挡配合', () => {
  const lv = (id: string) => LEVELS.find((x) => x.id === id)!;
  // 12-1：受控残影停在路口当墙，挡住另一个残影；不让挡就过不去
  it('12-1 受控残影得当墙：不能挡就无解', () => {
    expect(solve(lv('12-1'), { forbidBlock: true }).status).toBe('unsolvable');
  });
  // 12-2：两个受控残影同进同停，必须从后面推粉色那个一下（白赚一步）；不推就过不去，挡没用
  it('12-2 两个受控残影同进同停：不能推影子就无解', () => {
    expect(solve(lv('12-2'), { forbidPush: ['p>g'] }).status).toBe('unsolvable');
    expect(solve(lv('12-2'), { forbidBlock: true }).status).toBe('solved');
  });
  // 12-3：两个受控残影同进同停，必须挡住粉色那个一步；你没法一边踩 ▶ 一边挡，所以要留影
  it('12-3 两个受控残影同进同停：不能挡、不留影都无解', () => {
    expect(solve(lv('12-3'), { forbidBlock: true }).status).toBe('unsolvable');
    expect(solveWithoutGhosts(lv('12-3')).status).toBe('unsolvable');
  });
  it('12-3 参考解里挡住粉色残影的是你留的影子', () => {
    const l = lv('12-3');
    const r = runActions(l, l.solution!);
    const { board } = r;
    const echo = r.state.world.ghosts[0];
    const shadow = r.state.world.ghosts.find((g) => !g.preset)!;
    // 影子停在粉色残影前面那一格（它的必经之路）上
    expect(shadow.pos).toBe(echo.pos + 1);
    expect(board.plates[echo.pos]).toBe(1);
  });
});

describe('第 11 章：放人的是谁', () => {
  // 11-2：你挡了残影一步，它改道走过 r；11-3：你留的影子去踩 r，放出另一个影子
  const want: Record<string, string> = { '11-1': 'p', '11-2': 'e', '11-3': 'g' };
  for (const [id, who] of Object.entries(want)) {
    it(id, () => {
      const l = LEVELS.find((x) => x.id === id)!;
      expect(releasers(l)).toEqual([who]);
    });
  }
  it('11-2 不挡残影就无解', () => {
    expect(solve(LEVELS.find((x) => x.id === '11-2')!, { forbidBlock: true }).status).toBe('unsolvable');
  });
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('关卡 %s', (_id, level) => {
  it('不录影子时无解', () => {
    // 纯残影关（不能录影子）跳过，必要性由下面的消融保证
    if (level.maxGhosts === 0) return;
    expect(solveWithoutGhosts(level).status).toBe('unsolvable');
  });

  it('参考解通关，且用到了本章机制', () => {
    const t = replay(level);
    expect(t.won).toBe(true);
    const [label, check] = CHAPTER_CHECK[level.chapter];
    expect(check(t), `${level.id} 应包含：${label}；pushes=${t.pushes} blocks=${t.blocks}`).toBe(true);
  });

  it('求解器能解；关掉本章机制后无解', () => {
    expect(solve(level).status).toBe('solved');
    for (const o of CHAPTER_CHECK[level.chapter][2]) expect(solve(level, o).status, JSON.stringify(o)).toBe('unsolvable');
  });

  it('替换本章机关格子后无解（或更难）', () => {
    for (const a of MAP_ABL[level.id] ?? []) {
      const m = { ...level, map: substitute(level.map, a.from, a.to) };
      if (a.expect === 'unsolvable') expect(solve(m).status, `${a.from}->${a.to}`).toBe('unsolvable');
      else {
        const p = computePar(m);
        expect(p === null || p.steps > level.par!.steps || p.ghosts > level.par!.ghosts, `${a.from}->${a.to} ${JSON.stringify(p)}`).toBe(true);
      }
    }
  });

  it('星级目标与求解器一致', () => {
    expect(computePar(level)).toEqual(level.par);
  });

  it('影子上限是必要的：少一个就无解', () => {
    if (level.maxGhosts < 2) return;
    expect(solve(level, { maxGhosts: level.maxGhosts - 1 }).status).toBe('unsolvable');
  });
});
