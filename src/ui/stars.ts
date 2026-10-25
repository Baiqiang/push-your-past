import type { Par } from '../core/types';

/** 三颗星：过关；影子数不超过目标；步数不超过目标。两项目标可以分开拿 */
export interface StarResult {
  clear: boolean;
  ghosts: boolean;
  steps: boolean;
}

export function stars(par: Par | undefined, best: { ghosts: number; beats: number } | undefined): StarResult {
  if (!best) return { clear: false, ghosts: false, steps: false };
  return {
    clear: true,
    ghosts: !!par && best.ghosts <= par.ghosts,
    steps: !!par && best.beats <= par.steps,
  };
}

export function starCount(r: StarResult): number {
  return +r.clear + +r.ghosts + +r.steps;
}

export function starText(r: StarResult): string {
  return (r.clear ? '★' : '☆') + (r.ghosts ? '★' : '☆') + (r.steps ? '★' : '☆');
}
