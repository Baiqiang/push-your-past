import { LevelDef } from './core/types';
import type { Lang } from './i18n';

// localStorage 可能不可用（隐私模式等），所有读写都容错。
const KEY = 'push-your-past:v1';

export interface SaveData {
  solved: Record<string, { beats: number; ghosts: number }>;
  custom: LevelDef[];
  muted: boolean;
  trails: boolean;
  /** 操作说明弹过一次就不再自动弹 */
  controlsSeen?: boolean;
  /** 输过秘籍，提示已解锁 */
  cheats?: boolean;
  /** 未设置时按浏览器语言 */
  lang?: Lang;
}

const empty = (): SaveData => ({ solved: {}, custom: [], muted: false, trails: true });

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export function save(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* 忽略 */
  }
}
