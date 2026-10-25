// 核心数据类型。模拟层是纯函数、确定性的，不依赖渲染。

export type Dir = 0 | 1 | 2 | 3; // 上 右 下 左
export const WAIT = 4;
export type Instr = Dir | typeof WAIT;

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const INSTR_CHARS = ['U', 'R', 'D', 'L', 'W'];
export const INSTR_ARROWS = ['↑', '→', '↓', '←', '·'];

export const GATE_PAST = 1;
export const GATE_NOW = 2;
/** 裂地最多 30 格（位掩码放在一个 32 位整数里） */
export const MAX_CRACKS = 30;

export const enum Tile {
  Void = 0,
  Floor = 1,
  Wall = 2,
}

/** 静态关卡数据（解析后） */
export interface LevelDef {
  id: string;
  name: string;
  chapter: number;
  /** 开局显示的说明（第一次出现的机制在这里讲清楚） */
  hint?: string;
  /** 分步提示：由浅到深，一条比一条具体，但都不直接给出走法 */
  hints?: string[];
  maxGhosts: number;
  maxRecord: number;
  map: string[];
  /** 预设影子：地图里用数字 1-9 标出位置，program 为固定动作串（U R D L W）；以 ⏸ 开头表示开局待命 */
  presets?: string[];
  /** 已验证的参考解（动作字符串，见 game.ts ACTION_CHARS） */
  solution?: string;
  /** 星级目标：最少用几个影子、最少几步（由求解器算出，见 computePar） */
  par?: Par;
}

export interface Par {
  ghosts: number;
  steps: number;
}

export interface Board {
  w: number;
  h: number;
  tiles: Uint8Array; // Tile
  goals: Uint8Array; // 1 = 目标格
  exits: Uint8Array; // 1 = 出口
  /** 压力板：0 表示无，否则为通道号 1..4 */
  plates: Uint8Array;
  /** 门：0 表示无，否则为通道号 1..4 */
  doors: Uint8Array;
  /** 单向格：-1 无，否则只能沿该方向进入 */
  oneway: Int8Array;
  /** 身份闸：0 无，GATE_PAST 只放影子过，GATE_NOW 只放你过 */
  gates: Uint8Array;
  /** 待命台：从这里留下的影子回溯后先不动，等释放板被踩过才开始走 */
  hold: Uint8Array;
  /** 释放板：有东西压上，下一步所有待命的影子开始走 */
  release: Uint8Array;
  /** 裂地：-1 无，否则为它在 World.broken 位掩码里的位号 */
  cracked: Int8Array;
  /** 传送门：-1 无，否则为配对的另一端 */
  portal: Int32Array;
  /** 关卡里裂地格子的列表（位号即下标） */
  crackCells: number[];
  goalCount: number;
  hasExit: boolean;
}

export interface Ghost {
  id: number; // 出生序号，决定颜色与行动顺序
  pos: number;
  program: Instr[];
  ip: number; // 下一条要执行的指令
  /** 录制时的原始轨迹（含出生点），只用于显示 */
  recPath: number[];
  /** 每条已执行指令的结果，只用于时间线显示 */
  log: StepResult[];
  /** 关卡自带、玩家改不了录像的影子 */
  preset?: boolean;
  /** 出生时的 tick（预设影子为 0），用于回放 */
  born: number;
  /** 掉进坑里被抹除了：pos 为 -1，剩下的动作不再执行 */
  gone?: boolean;
  /** 待命中：还没被释放，原地不动（仍有碰撞，可以被推） */
  waiting?: boolean;
}

export type StepResult = 'ok' | 'blocked' | 'wait';

export interface World {
  player: number;
  boxes: number[]; // 保持有序
  ghosts: Ghost[];
  tick: number;
  /** 已经塌掉的裂地（位掩码，位号见 Board.cracked） */
  broken: number;
  /** 这条时间线上你每一步按了什么（只用于过关回放；求解器不维护） */
  inputs: Instr[];
}

export interface Recording {
  anchor: World;
  inputs: Instr[];
  path: number[];
}

export interface GameState {
  world: World;
  rec: Recording | null;
}

/** 实体标识：'p' 玩家，'b<i>' 箱子(按初始编号)，'g<id>' Ghost */
export type EntityId = string;

export type SimEvent =
  | { t: 'move'; id: EntityId; from: number; to: number; pushed: boolean; via?: number }
  | { t: 'bump'; id: EntityId; at: number; dir: Dir }
  | { t: 'door'; at: number; open: boolean }
  | { t: 'plate'; at: number; on: boolean }
  | { t: 'dormant'; id: EntityId }
  | { t: 'crack'; at: number }
  | { t: 'erase'; id: EntityId; at: number }
  | { t: 'release'; id: EntityId };
