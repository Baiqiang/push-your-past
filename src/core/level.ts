import { Board, GATE_NOW, GATE_PAST, Ghost, Instr, LevelDef, MAX_CRACKS, Tile, World } from './types';

/** 残影动作串的前缀：开局待命，等释放板 */
export const PRESET_HOLD = '⏸';
/** 残影动作串的前缀：只在释放板被压着时才走，半路松开就停 */
export const PRESET_GATED = '▶';

export function parseProgram(s: string): Instr[] {
  const out: Instr[] = [];
  for (const c of s.toUpperCase()) {
    const k = 'URDLW'.indexOf(c);
    if (k >= 0) out.push(k as Instr);
  }
  return out;
}

/*
 * 地图字符：
 *   #  墙          (空格) 虚空/地板（由洪水填充判断）
 *   .  空地        _ 目标格        $ 箱子       * 箱子在目标上
 *   @  玩家        + 玩家在目标上  E 出口
 *   a-d 压力板     A-D 门（同字母联动，E 被出口占用）
 *   ^ > v <  单向格，只能沿箭头方向进入
 *   1-9 预设影子出生点（动作串见 LevelDef.presets；以 ⏸ 开头表示开局待命，
 *       以 ▶ 开头表示只在释放板被压着的那几步才走）
 *   S  过去之闸：只有影子能过     Y  现在之闸：只有你能过（箱子都过不去）
 *   %  裂地：上面的东西离开后塌成坑（回溯后复原）。你和箱子过不去；影子掉进去就被抹除
 *   ( )  传送门：成对出现，走进一端从另一端出来
 *   H  待命台：在这里留下的影子（或站在这里的残影）回溯后先不动
 *   r  释放板：有东西压上，下一步所有待命的影子开始走
 */

export const LEGEND = {
  wall: '#',
  floor: '.',
  goal: '_',
  box: '$',
  boxOnGoal: '*',
  player: '@',
  playerOnGoal: '+',
  exit: 'E',
} as const;

const ONEWAY_CHARS = '^>v<';

export interface ParsedLevel {
  board: Board;
  world: World;
}

export function parseLevel(def: Pick<LevelDef, 'map' | 'presets'>): ParsedLevel {
  const rows = def.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const n = w * h;
  const board: Board = {
    w,
    h,
    tiles: new Uint8Array(n),
    goals: new Uint8Array(n),
    exits: new Uint8Array(n),
    plates: new Uint8Array(n),
    doors: new Uint8Array(n),
    oneway: new Int8Array(n).fill(-1),
    gates: new Uint8Array(n),
    hold: new Uint8Array(n),
    release: new Uint8Array(n),
    cracked: new Int8Array(n).fill(-1),
    portal: new Int32Array(n).fill(-1),
    crackCells: [],
    goalCount: 0,
    hasExit: false,
  };
  let player = -1;
  const boxes: number[] = [];
  const presetPos: number[] = [];
  const portalEnds: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] ?? ' ';
      const i = y * w + x;
      if (c === '#') {
        board.tiles[i] = Tile.Wall;
        continue;
      }
      if (c === ' ') continue; // 稍后由洪水填充决定
      board.tiles[i] = Tile.Floor;
      if (c === '_' || c === '*' || c === '+') board.goals[i] = 1;
      if (c === '$' || c === '*') boxes.push(i);
      if (c === '@' || c === '+') player = i;
      if (c === 'E') board.exits[i] = 1;
      if (c >= '1' && c <= '9') presetPos[+c - 1] = i;
      if (c >= 'a' && c <= 'd') board.plates[i] = c.charCodeAt(0) - 96;
      if (c >= 'A' && c <= 'D') board.doors[i] = c.charCodeAt(0) - 64;
      if (c === 'S') board.gates[i] = GATE_PAST;
      if (c === 'H') board.hold[i] = 1;
      if (c === 'r') board.release[i] = 1;
      if (c === 'Y') board.gates[i] = GATE_NOW;
      if (c === '%') {
        if (board.crackCells.length >= MAX_CRACKS) throw new Error('TOO_MANY_CRACKS');
        board.cracked[i] = board.crackCells.length;
        board.crackCells.push(i);
      }
      if (c === '(' || c === ')') portalEnds.push(i);
      const ow = ONEWAY_CHARS.indexOf(c);
      if (ow >= 0) board.oneway[i] = ow;
    }
  }
  if (player < 0) throw new Error('NO_PLAYER');
  if (portalEnds.length) {
    if (portalEnds.length !== 2) throw new Error('PORTAL_PAIR');
    board.portal[portalEnds[0]] = portalEnds[1];
    board.portal[portalEnds[1]] = portalEnds[0];
  }

  const ghosts: Ghost[] = [];
  const presets = def.presets ?? [];
  for (let k = 0; k < presets.length; k++) {
    const pos = presetPos[k];
    if (pos === undefined) throw new Error('PRESET_MISSING:' + (k + 1));
    const program = parseProgram(presets[k]);
    if (!program.length) throw new Error('PRESET_EMPTY:' + (k + 1));
    // 残影的编号占了地图上那一格，没法再写 H，所以用动作串开头的 ⏸ 表示“开局待命”
    const waiting = presets[k].startsWith(PRESET_HOLD);
    const gated = presets[k].startsWith(PRESET_GATED);
    ghosts.push({ id: k, pos, program, ip: 0, recPath: [pos], log: [], preset: true, born: 0, waiting, gated });
  }
  // 地图上放了数字却没写动作
  for (let k = presets.length; k < presetPos.length; k++) if (presetPos[k] !== undefined) throw new Error('PRESET_EMPTY:' + (k + 1));

  // 空格：与玩家连通的视为地板，否则为虚空
  const seen = new Uint8Array(n);
  const stack = [player];
  seen[player] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    const nb = [
      y > 0 ? i - w : -1,
      x < w - 1 ? i + 1 : -1,
      y < h - 1 ? i + w : -1,
      x > 0 ? i - 1 : -1,
    ];
    for (const j of nb) {
      if (j < 0 || seen[j] || board.tiles[j] === Tile.Wall) continue;
      const c = rows[(j / w) | 0][j % w] ?? ' ';
      seen[j] = 1;
      if (c === ' ') board.tiles[j] = Tile.Floor;
      stack.push(j);
    }
  }

  board.goalCount = board.goals.reduce((a, b) => a + b, 0);
  board.hasExit = board.exits.some((v) => v === 1);
  return { board, world: { player, boxes, ghosts, tick: 0, broken: 0, inputs: [] } };
}

/** 把 Board + 初始 World 序列化回地图字符串（编辑器用） */
export function serializeLevel(board: Board, world: World): string[] {
  const rows: string[] = [];
  for (let y = 0; y < board.h; y++) {
    let row = '';
    for (let x = 0; x < board.w; x++) {
      const i = y * board.w + x;
      row += cellChar(board, world, i);
    }
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows;
}

function cellChar(board: Board, world: World, i: number): string {
  if (board.tiles[i] === Tile.Wall) return '#';
  if (board.tiles[i] === Tile.Void) return ' ';
  const goal = board.goals[i] === 1;
  if (world.player === i) return goal ? '+' : '@';
  const pg = world.ghosts.find((g) => g.preset && g.pos === i);
  if (pg) return String(pg.id + 1);
  if (world.boxes.includes(i)) return goal ? '*' : '$';
  if (goal) return '_';
  if (board.exits[i]) return 'E';
  if (board.plates[i]) return String.fromCharCode(96 + board.plates[i]);
  if (board.doors[i]) return String.fromCharCode(64 + board.doors[i]);
  if (board.oneway[i] >= 0) return ONEWAY_CHARS[board.oneway[i]];
  if (board.gates[i]) return board.gates[i] === GATE_PAST ? 'S' : 'Y';
  if (board.hold[i]) return 'H';
  if (board.release[i]) return 'r';
  if (board.cracked[i] >= 0) return '%';
  if (board.portal[i] >= 0) return i < board.portal[i] ? '(' : ')';
  return '.';
}
