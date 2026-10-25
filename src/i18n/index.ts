import type { LevelDef } from '../core/types';
import type { Chapter } from '../levels';
import { en } from './en';
import { LEVEL_TEXT_EN } from './levels.en';
import { Dict, zh } from './zh';

export type Lang = 'zh' | 'en';
type Key = keyof Dict;

const DICTS: Record<Lang, Dict> = { zh, en };
let lang: Lang = 'zh';

export function detectLang(): Lang {
  const l = (navigator.languages?.[0] ?? navigator.language ?? 'zh').toLowerCase();
  return l.startsWith('zh') ? 'zh' : 'en';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  document.title = 'Push Your Past';
}

/** t('select.progress', { n: 3, total: 20 }) */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? zh[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

// 内置关卡的中文写在 levels.ts 里；英文在 levels.en.ts。自定义关卡只有作者写的一份。
export function levelName(def: LevelDef): string {
  if (lang === 'en' && def.chapter > 0) return LEVEL_TEXT_EN[def.id]?.name ?? def.name;
  return def.name;
}

export function levelHints(def: LevelDef): string[] {
  if (lang === 'en' && def.chapter > 0) return LEVEL_TEXT_EN[def.id]?.hints ?? def.hints ?? [];
  return def.hints ?? [];
}

export function levelHint(def: LevelDef): string | undefined {
  if (lang === 'en' && def.chapter > 0) return LEVEL_TEXT_EN[def.id]?.hint ?? def.hint;
  return def.hint;
}

const CHAPTER_EN: Record<number, [string, string]> = {
  1: ["Shadows", "Your past will comply. Exactly."],
  2: ["Displacement", "A displaced past carries on from where it lands."],
  3: ["Carried", "The past moves first. Stand in its way and you will be moved."],
  4: ["Collisions", "Pasts collide with each other as well."],
  5: ["Obstruction", "Echoes cannot be edited. Only obstructed."],
  6: ["Midway", "Imprint mid-route, and the rewind keeps everyone where they were."],
  7: ["Causality", "Change the earliest past, and every later one changes with it."],
  8: ["Clearance", "S admits the past. Y admits the present."],
  9: ["Fault Lines", "Collapsed ground swallows the past. Rewinding restores it."],
  10: ["Portals", "In one end, out the other."],
  11: ["On Hold", "A shadow can wait until someone steps on the release plate."],
};

export function chapterText(ch: Chapter): { title: string; subtitle: string } {
  const e = CHAPTER_EN[ch.id];
  if (lang === 'en' && e) return { title: e[0], subtitle: e[1] };
  return { title: ch.title, subtitle: ch.subtitle };
}

/** 把核心层抛出的错误码翻译成人话 */
export function errorText(err: unknown): string {
  const m = String((err as Error)?.message ?? err);
  if (m === 'NO_PLAYER') return t('err.noPlayer');
  const [code, n] = m.split(':');
  if (code === 'PRESET_MISSING') return t('err.presetMissing', { n });
  if (code === 'PRESET_EMPTY') return t('err.presetEmpty', { n });
  if (code === 'PORTAL_PAIR') return t('err.portalPair');
  if (code === 'TOO_MANY_CRACKS') return t('err.tooManyCracks');
  return m;
}
