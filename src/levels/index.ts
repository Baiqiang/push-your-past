import { LevelDef } from '../core/types';
import { LEVELS } from './levels';

export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
}

export const CHAPTERS: Chapter[] = [
  { id: 1, title: '影子', subtitle: '你走过的路，它会一步不差地再走一遍。' },
  { id: 2, title: '推它', subtitle: '把影子推开，它会在新的位置接着走。' },
  { id: 3, title: '被推', subtitle: '影子比你先动，挡在它前面就会被推着走。' },
  { id: 4, title: '互推', subtitle: '影子和影子之间，也会互相推。' },
  { id: 5, title: '挡住', subtitle: '残影改不了，但可以挡住它。' },
  { id: 6, title: '半路', subtitle: '在别人走到一半时留影，回溯后它也从那一半接着走。' },
  { id: 7, title: '连锁', subtitle: '动一下最早的影子，后面的全都跟着变。' },
  { id: 8, title: '身份闸', subtitle: 'S 只让影子过，Y 只让你过。' },
  { id: 9, title: '裂地', subtitle: '踩过就塌。影子掉进坑里，就没了。' },
  { id: 10, title: '传送门', subtitle: '从一头进去，从另一头出来。' },
  { id: 11, title: '待命', subtitle: '影子可以先等着，等有人踩下释放板再出发。' },
];

export { LEVELS };

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
