import type { SaveGame } from '../../game/save';
import type { UiNavigator } from '../navigator';
import { CREDITS } from './credits';
import { formatTime, levelTiers, mainMenuItems, type MainAction } from './model';
import { MENU_STYLE } from './style';

/**
 * The menu flow around the game (DESIGN.md §4.1): title with the main menu, Level Select,
 * Records, Settings (save export/import) and Credits, plus the New Game confirmation.
 * Plain DOM over the canvas; keyboard and gamepad go through the {@link UiNavigator}.
 */

export type Screen = 'title' | 'levels' | 'records' | 'settings' | 'credits' | 'confirmNew';

export interface MenuDeps {
  readonly save: SaveGame;
  /** Campaign order. */
  readonly levelIds: readonly string[];
  /** Whether saves persist (false: browser storage unavailable). */
  readonly persistent: () => boolean;
  readonly navigator: UiNavigator;
  /** Starts a level; the menus are already hidden. */
  play(levelId: string): void;
}

export interface Menus {
  show(screen?: Screen): void;
  hide(): void;
  readonly visible: boolean;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** "fixture" → "Fixture", "cold-storage" → "Cold Storage". */
export const levelTitle = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const STAT_LABELS: Record<string, string> = {
  time: 'Time',
  kills: 'Kills',
  neutralized: 'Neutralized',
  alerts: 'Alerts',
  spotted: 'Spotted',
  damageTaken: 'Damage taken',
  continues: 'Continues',
  itemsUsed: 'Items used',
  ammoUsed: 'Ammo used',
};

export function createMenus(root: HTMLElement, deps: MenuDeps): Menus {
  const style = document.createElement('style');
  style.textContent = MENU_STYLE;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'ns-menu';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Main menu');
  root.appendChild(el);
  // Keys pressed in the menus never reach the game's input.
  el.addEventListener('keydown', (e) => e.stopPropagation());

  const { save, levelIds } = deps;
  let screen: Screen = 'title';
  let open = false;
  let release: (() => void) | null = null;
  let status = '';

  const back = () => {
    if (screen !== 'title') go('title');
  };

  function go(next: Screen, focus?: string): void {
    screen = next;
    render();
    const target = focus ? el.querySelector<HTMLElement>(focus) : null;
    if (target) target.focus();
    else deps.navigator.focusFirst();
  }

  function play(id: string): void {
    menus.hide();
    deps.play(id);
  }

  const mainAction: Record<MainAction, () => void> = {
    start: () => {
      save.newGame();
      play(save.continueLevel());
    },
    continue: () => play(save.continueLevel()),
    newGame: () => go('confirmNew'),
    levelSelect: () => go('levels'),
    records: () => go('records'),
    settings: () => go('settings'),
    credits: () => go('credits'),
  };

  const backButton = '<button type="button" class="back" data-back>Back</button>';

  function titleHtml(): string {
    const items = mainMenuItems(save.hasSave())
      .map((i) => `<button type="button" data-main="${i.action}">${esc(i.label)}</button>`)
      .join('');
    return `<section class="active"><h1>NULL SIGNAL</h1><p class="tagline">TRAINING SIMULATION</p><nav class="items">${items}</nav></section>`;
  }

  function levelsHtml(): string {
    const tiers = levelTiers(levelIds, save)
      .map((t) => {
        const tiles = t.levels
          .map((l) => {
            const rank = l.rank ? `BEST <b>${l.rank}</b>` : l.state === 'locked' ? 'LOCKED' : 'NOT CLEARED';
            return `<button type="button" class="tile ${l.state}" data-level="${esc(l.id)}" ${l.state === 'locked' ? 'disabled aria-disabled="true"' : ''}>
              <span class="num">${String(l.number).padStart(2, '0')}</span>
              <span class="name">${l.state === 'locked' ? '— — —' : esc(levelTitle(l.id))}</span>
              <span class="rank">${rank}</span></button>`;
          })
          .join('');
        return `<div><h3>TIER ${t.number}</h3><div class="tier-grid">${tiles}</div></div>`;
      })
      .join('');
    return `<section class="active"><h2>LEVEL SELECT</h2><div class="tiers">${tiers}</div>${backButton}</section>`;
  }

  function recordsHtml(): string {
    const cleared = levelIds.filter((id) => save.bestResult(id));
    const body = cleared.length
      ? cleared
          .map((id) => {
            const r = save.bestResult(id);
            if (!r) return '';
            const statRows = Object.entries(r.stats)
              .filter(([k]) => k !== 'time')
              .map(([k, v]) => `<tr><td>${esc(STAT_LABELS[k] ?? k)}</td><td>${v}</td></tr>`)
              .join('');
            const scoreRows = r.breakdown
              .map(
                (b) =>
                  `<tr><td>${esc(STAT_LABELS[b.key] ?? b.key)}</td><td>${b.points > 0 ? '+' : ''}${Math.round(b.points)}</td></tr>`,
              )
              .join('');
            return `<article class="record">
              <header><span>${String(levelIds.indexOf(id) + 1).padStart(2, '0')} · ${esc(levelTitle(id))}</span><b>${r.rank}</b></header>
              <table><tr><td>Score</td><td>${r.score}</td></tr><tr><td>Time</td><td>${formatTime(r.time)}</td></tr>${statRows}</table>
              ${scoreRows ? `<h3 style="margin-top:12px">BREAKDOWN</h3><table>${scoreRows}</table>` : ''}
            </article>`;
          })
          .join('')
      : '<p class="muted">No levels cleared yet. Your best result on each level appears here.</p>';
    return `<section class="active"><h2>RECORDS</h2><div class="records">${body}</div>${backButton}</section>`;
  }

  function settingsHtml(): string {
    const storage = deps.persistent()
      ? ''
      : '<p class="muted warn">Browser storage is unavailable, so progress only lasts until this tab closes. Export your save to keep it.</p>';
    return `<section class="active"><h2>SETTINGS</h2>
      <div class="panel"><h3>SAVE DATA</h3>
        <p class="muted">Export your progress, records and settings to a file, or load one exported earlier. Importing replaces the current save.</p>
        ${storage}
        <div class="row">
          <button type="button" class="action" data-export>Export save</button>
          <button type="button" class="action" data-import>Import save</button>
          <input type="file" accept="application/json,.json" data-file hidden>
        </div>
        <p class="status" role="status">${esc(status)}</p>
      </div>${backButton}</section>`;
  }

  function creditsHtml(): string {
    const sections = CREDITS.map(
      (c) =>
        `<div class="credits"><h3>${esc(c.title.toUpperCase())}</h3>${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`,
    ).join('');
    return `<section class="active"><h2>CREDITS</h2>${sections}${backButton}</section>`;
  }

  function confirmHtml(): string {
    return `<section class="active confirm"><h2>NEW GAME</h2>
      <p class="muted">Start over from the first level? Your progress and records will be erased. Settings are kept.</p>
      <div class="row">
        <button type="button" class="action" data-confirm-new>Erase and start</button>
        <button type="button" class="action" data-back>Cancel</button>
      </div></section>`;
  }

  function render(): void {
    const html: Record<Screen, () => string> = {
      title: titleHtml,
      levels: levelsHtml,
      records: recordsHtml,
      settings: settingsHtml,
      credits: creditsHtml,
      confirmNew: confirmHtml,
    };
    el.innerHTML = html[screen]();
    el.scrollTop = 0;
  }

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t || t.hasAttribute('disabled')) return;
    const main = t.dataset.main as MainAction | undefined;
    if (main) mainAction[main]();
    else if (t.dataset.level) play(t.dataset.level);
    else if (t.hasAttribute('data-back')) back();
    else if (t.hasAttribute('data-confirm-new')) {
      save.newGame();
      play(save.continueLevel());
    } else if (t.hasAttribute('data-export')) exportSave();
    else if (t.hasAttribute('data-import')) el.querySelector<HTMLInputElement>('[data-file]')?.click();
  });

  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!input.hasAttribute('data-file') || !file) return;
    void file.text().then((text) => {
      const r = save.importJson(text);
      status = r.ok ? 'Save imported.' : `Import failed: ${r.error}.`;
      go('settings', '[data-import]');
    });
  });

  function exportSave(): void {
    const blob = new Blob([save.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'null-signal-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
    status = 'Save exported.';
    go('settings', '[data-export]');
  }

  const menus: Menus = {
    show(next = 'title') {
      status = '';
      el.classList.add('open');
      open = true;
      release ??= deps.navigator.activate(el, { onBack: back });
      go(next);
    },
    hide() {
      el.classList.remove('open');
      open = false;
      release?.();
      release = null;
    },
    get visible() {
      return open;
    },
  };
  return menus;
}
