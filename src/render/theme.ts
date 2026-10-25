import type { Ghost } from '../core/types';

// 霓虹主题色板。

export const THEME = {
  bg: 0x07060f,
  grid: 0x1a1736,
  floor: 0x0e0c1f,
  floorEdge: 0x221d47,
  wall: 0x2b2163,
  wallEdge: 0x7b5cff,
  goal: 0xffd23f,
  exit: 0x3dffb0,
  box: 0xff8a3d,
  boxOnGoal: 0xffd23f,
  player: 0x3de8ff,
  recording: 0xff3d7f,
  plate: [0, 0xff4fd8, 0x4f9dff, 0xb4ff4f, 0xffb84f],
  oneway: 0x8f7bff,
  echo: 0xc9d4ff,
  gatePast: 0xb48cff,
  gateNow: 0x3de8ff,
  crack: 0xa08870,
  portal: 0xff7a3d,
  hold: 0x8fe3ff,
  release: 0x8fffb0,
  ghosts: [0xc77dff, 0x5effc4, 0xffe066, 0xff6b9d, 0x6bd5ff, 0xff9f43],
};

/** 影子颜色：残影统一灰白，玩家录的影子按录制顺序取色 */
export function ghostColor(g: Ghost, all: Ghost[]): number {
  if (g.preset) return THEME.echo;
  let n = 0;
  for (const o of all) if (!o.preset && o.id < g.id) n++;
  return THEME.ghosts[n % THEME.ghosts.length];
}

/** 显示用编号：残影 1、2…；影子 1、2…（各自从 1 数） */
export function ghostNumber(g: Ghost, all: Ghost[]): number {
  let n = 1;
  for (const o of all) if (!!o.preset === !!g.preset && o.id < g.id) n++;
  return n;
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
