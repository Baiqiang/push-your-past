import { computePar, solve, solveWithoutGhosts, SolveResult } from '../core/solver';
import type { Par } from '../core/types';

export interface SolveRequest {
  map: string[];
  presets?: string[];
  maxGhosts: number;
  maxRecord: number;
  maxNodes: number;
}

export type SolveMessage =
  | { type: 'progress'; nodes: number }
  | { type: 'done'; noGhost: SolveResult; full: SolveResult | null; fewer: SolveResult | null; par?: Par | null; error?: string };

// 三项检查：不录影子能不能过；录影子最短解；少一个影子还能不能过
self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const req = e.data;
  const progress = (nodes: number) => self.postMessage({ type: 'progress', nodes } satisfies SolveMessage);
  try {
    const noGhost = solveWithoutGhosts(req, { maxNodes: req.maxNodes, onProgress: progress });
    let full: SolveResult | null = null;
    let fewer: SolveResult | null = null;
    if (req.maxGhosts > 0 && noGhost.status !== 'solved') {
      full = solve(req, { maxNodes: req.maxNodes, onProgress: progress });
      if (full.status === 'solved' && req.maxGhosts > 1) {
        fewer = solve(req, { maxNodes: req.maxNodes, maxGhosts: req.maxGhosts - 1, onProgress: progress });
      }
    }
    // 星级目标：自建关卡也能拿星
    const par = full?.status === 'solved' ? computePar(req, { maxNodes: req.maxNodes }) : null;
    self.postMessage({ type: 'done', noGhost, full, fewer, par } satisfies SolveMessage);
  } catch (err) {
    const nil: SolveResult = { status: 'unsolvable', nodes: 0 };
    self.postMessage({ type: 'done', noGhost: nil, full: null, fewer: null, error: String((err as Error).message ?? err) } satisfies SolveMessage);
  }
};
