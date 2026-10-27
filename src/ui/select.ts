import { LevelDef } from '../core/types';
import { CHAPTERS, LEVELS } from '../levels';
import { SaveData } from '../storage';
import { clear, h } from './dom';
import { starCount, stars, starText } from './stars';
import { chapterText, levelName, t } from '../i18n';

export interface SelectHooks {
  onBack(): void;
  onPlay(def: LevelDef): void;
  onEdit(def?: LevelDef): void;
  onDeleteCustom(id: string): void;
}

export class SelectScreen {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private progress: HTMLElement;

  constructor(private hooks: SelectHooks) {
    this.list = h('div.scroll');
    this.progress = h('div.hud-stat');
    this.el = h(
      'section.screen.bg-grid.select-screen',
      {},
      h(
        'div.topbar',
        {},
        h('button.btn.icon-btn', { onclick: () => hooks.onBack(), 'aria-label': t('play.back') }, '←'),
        h('h2', {}, t('select.heading')),
        this.progress,
      ),
      this.list,
    );
  }

  render(save: SaveData): void {
    clear(this.list);
    const done = LEVELS.filter((l) => save.solved[l.id]).length;
    // 星星统计：每关最多 3 颗（过关 + 影子数达标 + 步数达标）
    const starsOf = (ls: typeof LEVELS) => ls.reduce((n, l) => n + starCount(stars(l.par, save.solved[l.id])), 0);
    const got = starsOf(LEVELS);
    const max = LEVELS.length * 3;
    clear(this.progress);
    this.progress.append(
      t('select.progress', { n: done, total: LEVELS.length }),
      h('span.star-total' + (got === max ? '.full' : ''), {}, `★ ${got}/${max}`),
    );

    for (const ch of CHAPTERS) {
      const levels = LEVELS.filter((l) => l.chapter === ch.id);
      if (!levels.length) continue;
      const cards = levels.map((l) => {
        const s = save.solved[l.id];
        const st = stars(l.par, s);
        return h(
          'button.card' + (s ? '.solved' : ''),
          { onclick: () => this.hooks.onPlay(l) },
          h('div.id', {}, l.id, s && l.par ? h('span.card-stars', { 'aria-label': starText(st) }, starText(st)) : null),
          h('div.name', {}, levelName(l)),
          h('div.meta', {}, s ? (l.maxGhosts ? t('select.meta.solved', { g: s.ghosts, b: s.beats }) : '✓ ' + t('win.statsNoRec', { b: s.beats })) : l.maxGhosts ? t('select.meta', { g: l.maxGhosts, r: l.maxRecord }) : t('select.meta.noRec')),
        );
      });
      this.list.append(
        h(
          'div.chapter',
          {},
          h(
            'h3',
            {},
            h('span.num', {}, String(ch.id).padStart(2, '0')),
            chapterText(ch).title,
            (() => {
              const g = starsOf(levels);
              const m = levels.length * 3;
              return h('span.ch-stars' + (g === m ? '.full' : ''), { title: g === m ? t('select.allStars') : undefined }, `★ ${g}/${m}`);
            })(),
          ),
          h('p', {}, chapterText(ch).subtitle),
          h('div.cards', {}, ...cards),
        ),
      );
    }

    const custom = save.custom.map((l) =>
      h(
        'div.card',
        { role: 'button', tabindex: 0, onclick: () => this.hooks.onPlay(l) },
        h('div.id', {}, '★'),
        h('div.name', {}, l.name),
        h(
          'div.meta',
          {},
          h('button.btn', { style: 'padding:2px 8px;font-size:12px', onclick: (e: Event) => (e.stopPropagation(), this.hooks.onEdit(l)) }, t('select.edit')),
          ' ',
          h('button.btn', { style: 'padding:2px 8px;font-size:12px', onclick: (e: Event) => (e.stopPropagation(), this.hooks.onDeleteCustom(l.id)) }, t('select.delete')),
        ),
      ),
    );
    this.list.append(
      h(
        'div.chapter',
        {},
        h('h3', {}, h('span.num', {}, '★'), t('select.custom')),
        h('p', {}, t('select.custom.sub')),
        h('div.cards', {}, h('button.card', { onclick: () => this.hooks.onEdit() }, h('div.name', {}, t('select.new'))), ...custom),
      ),
    );
  }
}
