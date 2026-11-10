import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { SearchResult } from '../engine/tabulator';
import { EngineClient } from '../worker/client';
import { matchesFilter, sortByScore, wordLengthBounds, type WordFilter } from './filter';

type Word = SearchResult['words'][number];

interface SavedFilters {
  min: string;
  max: string;
  positions: string[];
  endPositions: string[];
  tiles: number[];
}

function isSavedFilters(value: unknown): value is SavedFilters {
  if (typeof value !== 'object' || value === null) return false;
  const saved = value as Record<string, unknown>;
  const strings = (list: unknown) => Array.isArray(list) && list.every((item) => typeof item === 'string');
  return typeof saved.min === 'string' && typeof saved.max === 'string'
    && strings(saved.positions) && strings(saved.endPositions)
    && Array.isArray(saved.tiles) && saved.tiles.every((item) => Number.isInteger(item));
}

function haptic(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8);
}

// Keeps the text input focused (and the on-screen keyboard open) when a button is pressed.
const keepFocus = (event: Event): void => event.preventDefault();

export class SkraflApp extends LitElement {
  static properties = {
    input: { state: true },
    result: { state: true },
    status: { state: true },
    searching: { state: true },
    failure: { state: true },
    helpOpen: { state: true },
    filterMin: { state: true },
    filterMax: { state: true },
    positions: { state: true },
    endPositions: { state: true },
    sortMode: { state: true },
    filterContains: { state: true },
    selectedTiles: { state: true },
    appliedFilter: { state: true },
    updateAvailable: { state: true },
    updating: { state: true },
  };

  declare private input: string;
  declare private result: SearchResult | null;
  declare private status: string;
  declare private searching: boolean;
  declare private failure: string;
  declare private helpOpen: boolean;
  declare private filterMin: string;
  declare private filterMax: string;
  declare private positions: string[];
  declare private endPositions: string[];
  declare private sortMode: 'default' | 'score';
  declare private filterContains: string;
  declare private selectedTiles: number[];
  declare private appliedFilter: WordFilter;
  declare private updateAvailable: (() => Promise<void>) | null;
  declare private updating: boolean;
  private client: EngineClient | null = null;
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private bounds = { min: 1, max: 15 };

  constructor() {
    super();
    this.input = '';
    this.result = null;
    this.status = '';
    this.searching = false;
    this.failure = '';
    this.helpOpen = false;
    this.filterMin = '1';
    this.filterMax = '15';
    this.positions = [];
    this.endPositions = [];
    this.sortMode = 'default';
    this.filterContains = '';
    this.selectedTiles = [];
    this.appliedFilter = { min: 1, max: 15, positions: [], endPositions: [], contains: '' };
    this.updateAvailable = null;
    this.updating = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.client = new EngineClient((status) => { this.status = status; });
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('pwa-update', this.onUpdateAvailable);
    const url = new URL(window.location.href);
    this.input = url.searchParams.get('rack') ?? '';
    const state: unknown = window.history.state;
    const saved = (state as { filters?: unknown } | null)?.filters;
    window.history.replaceState({ rack: this.input, filters: saved }, '', url);
    if (this.input.trim()) void this.search(this.input, false, isSavedFilters(saved) ? saved : null);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('pwa-update', this.onUpdateAvailable);
    clearTimeout(this.filterTimer);
    this.requestId++;
    this.client?.dispose();
    this.client = null;
  }

  private readonly onPopState = (event: PopStateEvent): void => {
    this.input = new URL(window.location.href).searchParams.get('rack') ?? '';
    if (this.input.trim()) {
      const saved = (event.state as { filters?: unknown } | null)?.filters;
      void this.search(this.input, false, isSavedFilters(saved) ? saved : null);
    } else {
      this.requestId++;
      this.result = null;
      this.sortMode = 'default';
      this.failure = '';
      this.searching = false;
      this.client?.dispose();
    }
  };

  private readonly onUpdateAvailable = (event: Event): void => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (typeof detail === 'function') this.updateAvailable = detail as () => Promise<void>;
  };

  private async installUpdate(): Promise<void> {
    if (!this.updateAvailable || this.updating) return;
    this.updating = true;
    try {
      await this.updateAvailable();
    } catch {
      this.failure = 'Ekki tókst að uppfæra. Reyndu aftur.';
    } finally {
      this.updating = false;
    }
  }

  private async search(value: string, push = true, saved: SavedFilters | null = null): Promise<void> {
    const input = value;
    if (!input.trim() || !this.client) return;
    this.input = input;
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('rack', input);
      window.history.pushState({ rack: input }, '', url);
    }
    const requestId = ++this.requestId;
    this.searching = true;
    this.status = '';
    this.failure = '';
    this.result = null;
    this.sortMode = 'default';
    try {
      const result = await this.client.search(input);
      if (requestId !== this.requestId) return;
      this.result = result;
      this.bounds = wordLengthBounds([
        ...result.words,
        ...result.combinations.flatMap((group) => group.words),
      ]);
      if (saved) this.restoreFilters(saved); else this.clearFilters();
    } catch (error: unknown) {
      if (requestId !== this.requestId) return;
      if (!(error instanceof Error && error.name === 'AbortError')) {
        this.failure = 'Ekki tókst að hlaða orðasafninu eða leita. Athugaðu nettenginguna og reyndu aftur.';
      }
    } finally {
      if (requestId === this.requestId) this.searching = false;
    }
  }

  private retry(): void {
    this.client?.retry();
    void this.search(this.input, false);
  }

  private insertQuestionMark(): void {
    const rack = this.renderRoot.querySelector<HTMLInputElement>('#rack');
    if (!rack) return;
    haptic();
    const focused = (this.renderRoot as ShadowRoot).activeElement === rack;
    const start = focused ? rack.selectionStart ?? rack.value.length : rack.value.length;
    const end = focused ? rack.selectionEnd ?? start : start;
    if (rack.value.length - (end - start) + 1 > rack.maxLength) return;
    rack.setRangeText('?', start, end, 'end');
    this.input = rack.value;
    if (!focused) rack.focus();
  }

  private focusRack(): void {
    this.renderRoot.querySelector<HTMLInputElement>('#rack')?.focus();
  }

  private clearInput(): void {
    this.input = '';
    void this.updateComplete.then(() => this.focusRack());
  }

  private toggleEquals(): void {
    this.input = this.input.startsWith('=') ? this.input.slice(1) : `=${this.input}`.slice(0, 15);
    void this.updateComplete.then(() => this.focusRack());
  }

  private submit(event: Event): void {
    event.preventDefault();
    void this.search(this.input);
  }

  private selectWord(event: MouseEvent, word: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    void this.search(word);
  }

  private get positionCount(): number {
    const value = Number.parseInt(this.filterMax, 10);
    return Number.isNaN(value) ? this.bounds.max : Math.max(0, Math.min(this.bounds.max, value));
  }

  private get lengthRange(): { low: number; high: number } {
    const { min, max } = this.bounds;
    const low = Number.parseInt(this.filterMin, 10);
    const high = Number.parseInt(this.filterMax, 10);
    const clamp = (value: number) => Math.max(min, Math.min(max, value));
    const high2 = Number.isNaN(high) ? max : clamp(high);
    return { low: Math.min(Number.isNaN(low) ? min : clamp(low), high2), high: high2 };
  }

  private setLength(which: 'min' | 'max', value: number): void {
    const { low, high } = this.lengthRange;
    const clamped = Math.max(this.bounds.min, Math.min(this.bounds.max, value));
    const next = which === 'min' ? Math.min(clamped, high) : Math.max(clamped, low);
    if (next === (which === 'min' ? low : high)) return;
    haptic();
    if (which === 'min') this.filterMin = String(next);
    else this.filterMax = String(next);
    this.scheduleFilters();
  }

  private get rackTiles(): string[] {
    const rack = (this.result?.rack ?? '').toLocaleLowerCase('is');
    return Array.from(rack).filter((char) => /\p{L}/u.test(char));
  }

  private toggleTile(index: number): void {
    haptic();
    this.selectedTiles = this.selectedTiles.includes(index)
      ? this.selectedTiles.filter((tile) => tile !== index)
      : [...this.selectedTiles, index];
    this.scheduleFilters();
  }

  private scheduleFilters(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.applyFilters(), 100);
  }

  private applyFilters(): void {
    const min = Number.parseInt(this.filterMin, 10);
    const max = Number.parseInt(this.filterMax, 10);
    const visibleMax = Number.isNaN(max) ? this.bounds.max : Math.max(0, Math.min(this.bounds.max, max));
    const tiles = this.rackTiles;
    this.filterContains = this.selectedTiles.map((index) => tiles[index] ?? '').join('');
    this.appliedFilter = {
      min: Number.isNaN(min) ? this.bounds.min : min,
      max: visibleMax,
      positions: this.positions.slice(0, visibleMax),
      endPositions: this.endPositions.slice(0, visibleMax),
      contains: this.filterContains,
    };
    this.persistFilters();
  }

  // Stored in the history entry so back/forward navigation and reloads restore the filters.
  private persistFilters(): void {
    if (typeof window === 'undefined' || !this.result) return;
    const filters: SavedFilters = {
      min: this.filterMin, max: this.filterMax, positions: this.positions,
      endPositions: this.endPositions, tiles: this.selectedTiles,
    };
    const rack = new URL(window.location.href).searchParams.get('rack') ?? '';
    window.history.replaceState({ rack, filters }, '');
  }

  private restoreFilters(saved: SavedFilters): void {
    const tileCount = this.rackTiles.length;
    clearTimeout(this.filterTimer);
    this.filterMin = saved.min;
    this.filterMax = saved.max;
    this.positions = saved.positions;
    this.endPositions = saved.endPositions;
    this.selectedTiles = saved.tiles.filter((tile) => tile >= 0 && tile < tileCount);
    this.applyFilters();
  }

  private clearFilters(): void {
    clearTimeout(this.filterTimer);
    this.filterMin = String(this.bounds.min);
    this.filterMax = String(this.bounds.max);
    this.positions = [];
    this.endPositions = [];
    this.selectedTiles = [];
    this.applyFilters();
  }

  private get filtersActive(): boolean {
    const filter = this.appliedFilter;
    return filter.min > this.bounds.min || filter.max < this.bounds.max || filter.contains !== ''
      || filter.positions.some((value) => value.trim()) || filter.endPositions.some((value) => value.trim());
  }

  private renderStepper(which: 'min' | 'max') {
    const { low, high } = this.lengthRange;
    const value = which === 'min' ? low : high;
    const label = which === 'min' ? 'Lágmarkslengd' : 'Hámarkslengd';
    return html`<div class="stepper" role="group" aria-label=${label}>
      <button type="button" class="secondary icon" aria-label=${`${label} minnka`}
        ?disabled=${value <= (which === 'min' ? this.bounds.min : low)}
        @click=${() => this.setLength(which, value - 1)}>−</button>
      <output aria-label=${label}>${value}</output>
      <button type="button" class="secondary icon" aria-label=${`${label} auka`}
        ?disabled=${value >= (which === 'min' ? high : this.bounds.max)}
        @click=${() => this.setLength(which, value + 1)}>+</button>
    </div>`;
  }

  private renderPositions(end: boolean) {
    const count = this.positionCount;
    const values = end ? this.endPositions : this.positions;
    const indexes = Array.from({ length: count }, (_, index) => (end ? count - 1 - index : index));
    return html`<div class="positions ${end ? 'end' : ''}">
      ${repeat(indexes, (index) => index, (index) => html`<input class="position" type="text"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        aria-label=${end ? `Stafir í sæti ${index + 1} frá enda` : `Stafir í sæti ${index + 1}`}
        placeholder=${String(index + 1)} .value=${values[index] ?? ''}
        @input=${(event: Event) => {
          const next = [...values];
          next[index] = (event.target as HTMLInputElement).value;
          if (end) this.endPositions = next; else this.positions = next;
          this.scheduleFilters();
        }}>`)}
    </div>`;
  }

  private renderFilters() {
    const { low, high } = this.lengthRange;
    const { min, max } = this.bounds;
    const tiles = this.rackTiles;
    return html`
      <section class="panel filters" aria-label="Sía niðurstöður">
        <fieldset>
          <legend>Lengd: <span class="range-text">${low === high ? low : `${low}–${high}`}</span></legend>
          <div class="filter-row">
            ${this.renderStepper('min')}<span aria-hidden="true">–</span>${this.renderStepper('max')}
          </div>
          ${max > min ? html`<div class="range">
            <input type="range" class=${low > (min + max) / 2 ? 'raised' : ''} aria-label="Lágmarkslengd"
              min=${min} max=${max} step="1" .value=${String(low)}
              @input=${(event: Event) => this.setLength('min', Number((event.target as HTMLInputElement).value))}>
            <input type="range" aria-label="Hámarkslengd" min=${min} max=${max} step="1" .value=${String(high)}
              @input=${(event: Event) => this.setLength('max', Number((event.target as HTMLInputElement).value))}>
          </div>` : nothing}
        </fieldset>
        <fieldset>
          <legend>Sæti frá byrjun: <span class="hint">einn eða fleiri stafir í hverju sæti</span></legend>
          ${this.renderPositions(false)}
        </fieldset>
        <fieldset>
          <legend>Sæti frá enda:</legend>
          ${this.renderPositions(true)}
        </fieldset>
        ${tiles.length ? html`<fieldset>
          <legend>Inniheldur: <span class="hint">veldu stafi úr rekkanum</span></legend>
          <div class="tiles">
            ${tiles.map((tile, index) => html`<button type="button" class="tile secondary"
              aria-pressed=${String(this.selectedTiles.includes(index))}
              @click=${() => this.toggleTile(index)}>${tile}</button>`)}
          </div>
        </fieldset>` : nothing}
        <div class="filter-row">
          <button type="button" class="secondary" ?disabled=${!this.filtersActive}
            @click=${this.clearFilters}>Hreinsa síur</button>
        </div>
      </section>`;
  }

  private get displayRack(): string {
    return this.result?.rack.replace(/^= /, '=') ?? '';
  }

  private get displayValid(): boolean {
    const result = this.result;
    if (!result) return false;
    return result.valid || (this.displayRack.startsWith('=')
      && result.words.some(({ word }) => word === this.displayRack.slice(1)));
  }

  private renderWord(word: Word, letter?: string) {
    const result = this.result!;
    const rackLength = result.rack.replace(/\s/g, '').replace(/^=/, '').length;
    const color = word.word.length >= 7 ? 'bingo'
      : word.word.length === rackLength ? 'anagram' : 'regular';
    const high = result.highwords.includes(word.word);
    return html`<a class="chip ${color}" href=${`?rack=${encodeURIComponent(word.word)}`}
      data-word=${word.word} @click=${(event: MouseEvent) => this.selectWord(event, word.word)}>
      ${letter ? html`<span class="added" aria-label=${`Viðbættur stafur ${letter}`}>${letter}</span>` : nothing}
      ${high ? html`<span aria-label="Hæsta skor">★</span>` : nothing}
      ${word.word}<span class="score">${word.score}</span>
    </a>`;
  }

  private renderResults() {
    const result = this.result;
    if (!result) return nothing;
    if (!result.ok) return html`<p class="notice" role="alert">${result.error ?? 'Ekki tókst að leita.'}</p>`;
    const bySort = this.sortMode === 'score';
    const filtered = result.words.filter(({ word }) => matchesFilter(word, this.appliedFilter));
    const words = bySort ? sortByScore(filtered) : filtered;
    const groups = result.combinations.map((group) => ({
      ...group,
      words: group.words.filter(({ word }) => matchesFilter(word, this.appliedFilter)),
    }));
    const flat = sortByScore(groups.flatMap((group) => group.words.map((word) => ({ ...word, letter: group.letter }))));
    const combinationTotal = result.combinations.reduce((total, group) => total + group.words.length, 0);
    const combinationShown = groups.reduce((total, group) => total + group.words.length, 0);
    return html`
      ${result.words.length || combinationTotal ? this.renderFilters() : nothing}
      <div class="sticky-bar">
        <p class="count" aria-live="polite">Sýni <strong>${words.length}</strong> af ${result.words.length} orðum${
          combinationTotal ? html` · ${combinationShown} af ${combinationTotal} með einum staf` : nothing}</p>
        <div class="bar-actions">
          ${this.filtersActive ? html`<button type="button" class="secondary" @click=${this.clearFilters}>Hreinsa síur</button>` : nothing}
          <div class="segmented" role="group" aria-label="Röðun">
            <button type="button" class="secondary" aria-pressed=${String(!bySort)}
              @click=${() => { this.sortMode = 'default'; }}>Sjálfgefið</button>
            <button type="button" class="secondary" aria-pressed=${String(bySort)}
              @click=${() => { this.sortMode = 'score'; }}>Hæsta skor</button>
          </div>
        </div>
      </div>
      <section class="panel" aria-labelledby="results-heading">
        <div class="result-heading">
          <h2 id="results-heading">
            <a class="chip original" href=${`?rack=${encodeURIComponent(result.rack.replace(/\s/g, ''))}`}
              @click=${(event: MouseEvent) => this.selectWord(event, result.rack.replace(/\s/g, ''))}>
              ${this.displayValid ? html`<span aria-label="Leyfilegt orð">✓</span>` : nothing}
              ${this.displayRack}
            </a>
          </h2>
          <span>hæsta skor <span aria-label="stjarna">★</span> <strong>${result.highscore}</strong></span>
        </div>
        <div class="word-list">
          ${words.map((word) => this.renderWord(word))}
        </div>
        ${!result.words.length ? html`<p>Engin orð fundust.</p>`
          : !words.length ? html`<p>Engin orð passa við síuna.</p>` : nothing}
      </section>
      ${combinationTotal ? html`
        <section class="panel combinations" aria-labelledby="combinations-heading">
          <h2 id="combinations-heading">Að viðbættum einum staf</h2>
                    <div class="word-list">
            ${bySort ? flat.map((word) => this.renderWord(word, word.letter))
              : groups.filter((group) => group.words.length).map((group) => html`
              <div class="combination-group">
                <span class="letter" aria-label=${`Viðbættur stafur ${group.letter}`}>${group.letter}</span>
                ${group.words.map((word) => this.renderWord(word))}
              </div>`)}
          </div>
          ${!combinationShown ? html`<p>Engin orð passa við síuna.</p>` : nothing}
        </section>` : nothing}`;
  }

  private async openHelp(): Promise<void> {
    this.helpOpen = true;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.showModal();
  }

  private closeHelp(): void {
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    this.helpOpen = false;
  }

  private renderHelp() {
    return html`<dialog aria-labelledby="help-title" @close=${() => { this.helpOpen = false; }}>
      <div class="dialog-heading">
        <h2 id="help-title">Skraflorðahjálp</h2>
        <button type="button" class="secondary" aria-label="Loka hjálp" @click=${this.closeHelp}>Loka</button>
      </div>
      <p>Sláðu inn stafina sem þú ert með í rekkanum í skrafli. Notaðu <strong>?</strong>
        fyrir eyðuna sem táknað getur alla stafi.</p>
      <p>Vefurinn sýnir þér öll <span class="legend regular">leyfileg</span> orð sem unnt er að mynda
        úr þeim stöfum, samkvæmt <a href="https://bin.arnastofnun.is/forsida/">Beygingarlýsingu íslensks
        nútímamáls</a>. Leyfileg tveggja stafa orð eru samkvæmt lista Skraflfélags Íslands eins og hann
        var ákvarðaður af Orðanefnd þess í september 2015.</p>
      <p>Þú getur einnig slegið inn <strong>=<i>mynstur</i></strong> til að sjá öll orð sem samrýmast
        mynstrinu. Notaðu <strong>?</strong> sem algildi. <strong>=?ex?</strong> skilar til dæmis öllum
        fjögurra stafa orðum með <strong>ex</strong> í miðjunni, svo sem <strong>kexi</strong>
        og <strong>rexa</strong>.</p>
      <p>Ef rekkinn sem þú slóst inn er sjálfur leyfilegt orð skv. BÍN er það sýnt með haki
        <span aria-label="hak">✓</span> fyrir framan orðið.</p>
      <p>Þau leyfilegu orð sem gæfu flest stig (án tillits til tvöföldunar- eða þreföldunar-reita)
        eru <span aria-label="stjarna">★</span> stjörnumerkt.</p>
      <p>Möguleikar á að fá "bingó", þ.e. að leggja niður alla sjö stafina úr rekkanum, eru auðkenndir
        með <span class="legend bingo">rauðum</span> lit.</p>
      <p>Umraðanir (anagröm) allra stafanna sem þú slóst inn eru auðkenndar með
        <span class="legend anagram">appelsínugulum</span> lit.</p>
      <p>Einnig eru sýnd þau orð sem unnt er að búa til úr rekkanum að viðbættum einum staf.</p>
      <p>Hægt er að smella á leyfileg orð, sem sýnd eru, í stað þess að slá þau inn.</p>
      <p>Síurnar gilda um báða orðalista. Lengd velur stystu og lengstu orð með sleðum eða
        +/− hnöppum. Í Sæti frá byrjun og Sæti frá enda má skrifa einn eða fleiri stafi í hvert sæti;
        orðið passar ef stafurinn á þeim stað er einhver þeirra (<strong>al</strong> í sæti 2 leyfir bæði
        „ball“ og „ale“). Inniheldur sýnir stafina úr rekkanum: snertu staf til að krefjast hans, og
        veldu staf tvisvar (tvo reiti) til að krefjast hans tvisvar. Ef ekkert er valið er ekkert skilyrði.
        Síurnar muna stillingar þegar þú ferð til baka eða endurhleður síðuna.</p>
      <p>Hnappurinn <strong>?</strong> setur eyðu inn í innsláttarreitinn án þess að lyklaborðið hverfi.</p>
      <p>Höfundur skraflorðahjálpar er <strong>Vilhjálmur Þorsteinsson</strong>. Skoðaðu einnig
        <a href="https://netskrafl.is"><strong>Netskrafl</strong></a> eftir sama höfund!</p>
      <p>Höfundarréttur að Beygingarlýsingu íslensks nútímamáls er á hendi <i>Stofnunar Árna Magnússonar
        í íslenskum fræðum</i>. BÍN er notað í Skraflorðahjálp skv.
        <a href="https://bin.arnastofnun.is/gogn/skilmalar/">skilmálum SÁM</a>.</p>
      <p><a href="https://github.com/siggibjarna/Skrafl">Upprunalegur kóði Skraflorðahjálpar</a></p>
    </dialog>`;
  }

  private get statusText(): string {
    if (!this.searching) return '';
    const status = this.status.toLowerCase();
    if (status.includes('download') || status.includes('sæki')) return 'Sæki orðasafn…';
    if (status.includes('pars') || status.includes('les orðasafn')) return 'Les orðasafn…';
    return 'Leita að orðum…';
  }

  override render() {
    return html`
      <main lang="is">
        <header>
          <div><h1>Skraflorðahjálp</h1><p class="byline">eftir Vilhjálm Þorsteinsson</p></div>
          <button type="button" class="secondary" @click=${this.openHelp}>Hjálp</button>
        </header>
        ${this.updateAvailable ? html`<aside class="update">
          <button type="button" ?disabled=${this.updating} @click=${this.installUpdate}>Ný útgáfa tiltæk</button>
        </aside>` : nothing}
        <section class="panel search-panel" aria-label="Leit">
          <form @submit=${this.submit}>
            <label for="rack">Sláðu inn stafi úr skraflrekkanum</label>
            <div class="search-row">
              <input id="rack" name="rack" type="text" maxlength="15" required
                autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
                enterkeyhint="search" placeholder="Stafir, ? eða =mynstur" .value=${this.input}
                @input=${(event: Event) => { this.input = (event.target as HTMLInputElement).value; }}>
              ${this.input ? html`<button type="button" class="secondary icon" aria-label="Hreinsa stafi"
                title="Hreinsa" @pointerdown=${keepFocus} @mousedown=${keepFocus}
                @click=${this.clearInput}>✕</button>` : nothing}
              <button type="button" class="secondary icon" aria-label="Mynstur (=)" title="Mynstur (=)"
                aria-pressed=${String(this.input.startsWith('='))} @pointerdown=${keepFocus}
                @mousedown=${keepFocus} @click=${this.toggleEquals}>=</button>
              <button type="button" class="secondary icon" aria-label="Eyða (?)" title="Eyða (?)"
                @pointerdown=${keepFocus} @mousedown=${keepFocus} @click=${this.insertQuestionMark}>?</button>
              <button type="submit">Finna öll möguleg orð</button>
            </div>
          </form>
          <p class="hint">Notaðu ? fyrir eyðu eða = fyrir mynstur.</p>
        </section>
        <div role="status" aria-live="polite" aria-atomic="true">
          ${!this.failure && this.statusText ? html`<p class="loading">${this.statusText}</p>` : nothing}
        </div>
        ${this.failure ? html`<section class="notice" role="alert">
          <p>${this.failure}</p><button type="button" @click=${this.retry}>Reyna aftur</button>
        </section>` : nothing}
        <div aria-busy=${String(this.searching)}>${this.renderResults()}</div>
        ${this.helpOpen ? this.renderHelp() : nothing}
      </main>`;
  }

  static override styles = css`
    :host { display: block; color: #20352c; font: 16px/1.5 system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    main { max-width: 1100px; margin: auto; padding: max(18px, env(safe-area-inset-top))
      max(16px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left)); }
    header, .dialog-heading, .result-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    header { margin-bottom: 24px; }
    h1 { font-size: clamp(1.6rem, 5vw, 2.1rem); margin: 0; letter-spacing: -.03em; }
    h2 { font-size: 1.1rem; margin: 0; }
    p { margin: .75rem 0; }
    .byline, .hint, .count { color: #52685c; font-size: .9rem; }
    .byline { margin: 2px 0 0; }
    .panel { border: 1px solid #c9d8ce; border-radius: 12px; background: #fff; padding: 18px; margin-bottom: 16px; }
    .search-panel { background: #f1f7f2; border-top: 4px solid #28733e; }
    label, legend { font-weight: 600; }
    button.icon { min-width: 44px; padding: 9px 12px; }
    .segmented { display: flex; }
    .segmented button { border-radius: 0; padding: 6px 12px; min-height: 36px; }
    .segmented button:first-child { border-radius: 7px 0 0 7px; }
    .segmented button:last-child { border-radius: 0 7px 7px 0; }
    .segmented button[aria-pressed="true"] { background: #246e3b; color: white; border-color: #246e3b; }
    .positions.end { justify-content: flex-end; }
    .added { background: #d9eaf1; color: #204c62; border-radius: 4px; padding: 0 5px; margin-right: 4px; font-weight: 700; }
    .search-row { display: flex; gap: 10px; margin-top: 10px; }
    input, button { min-height: 44px; border: 1px solid #899e90; border-radius: 7px; font: inherit; font-size: 16px; }
    input { padding: 9px 10px; background: white; color: #20352c; min-width: 0; }
    #rack { flex: 1; width: 100%; font-size: 20px; }
    button { padding: 9px 15px; cursor: pointer; color: white; background: #246e3b; border-color: #246e3b; font-weight: 600; }
    button.secondary { background: white; color: #28563b; border-color: #9eafa4; }
    button:disabled { opacity: .6; cursor: wait; }
    a { color: #1b6235; }
    button:hover, .chip:hover { filter: brightness(.94); }
    :is(a, button, input):focus-visible { outline: 3px solid #226bc6; outline-offset: 3px; }
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
    .filter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .stepper { display: inline-flex; align-items: center; gap: 4px; }
    .stepper output { min-width: 2ch; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stepper button:disabled { opacity: .4; cursor: default; }
    .range-text { font-weight: 400; }
    legend .hint { font-weight: 400; }
    .range { position: relative; height: 44px; margin-top: 4px; }
    .range::before { content: ''; position: absolute; left: 14px; right: 14px; top: 50%; height: 4px;
      margin-top: -2px; border-radius: 2px; background: #c9d8ce; }
    .range input { position: absolute; inset: 0; width: 100%; min-height: 0; margin: 0; padding: 0; border: 0;
      background: none; pointer-events: none; appearance: none; -webkit-appearance: none; }
    .range input.raised { z-index: 2; }
    .range input::-webkit-slider-runnable-track { background: transparent; }
    .range input::-moz-range-track { background: transparent; }
    .range input::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 28px; height: 28px;
      border-radius: 50%; background: #246e3b; border: 3px solid #fff; box-shadow: 0 0 0 1px #246e3b; cursor: grab; }
    .range input::-moz-range-thumb { pointer-events: auto; width: 22px; height: 22px; border-radius: 50%;
      background: #246e3b; border: 3px solid #fff; box-shadow: 0 0 0 1px #246e3b; cursor: grab; }
    .tiles { display: flex; flex-wrap: wrap; gap: 8px; }
    .tile { min-width: 44px; font-size: 18px; text-transform: uppercase; }
    .tile[aria-pressed="true"] { background: #246e3b; color: white; border-color: #246e3b; }
    .sticky-bar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
      gap: 10px; flex-wrap: wrap; margin: 0 -4px 12px; padding: 8px 4px; background: #f6faf7ee;
      backdrop-filter: blur(6px); border-bottom: 1px solid #c9d8ce; }
    .sticky-bar .count { margin: 0; }
    .bar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .bar-actions > button { min-height: 36px; padding: 6px 12px; }
    fieldset { margin: 0; padding: 0; border: 0; min-width: 0; flex: 1 1 100%; }
    legend { padding: 0; margin-bottom: 6px; }
    .positions { display: flex; gap: 5px; flex-wrap: wrap; }
    input.position { flex: 0 0 auto; width: 58px; text-align: center; padding: 8px 2px; }
    .word-list { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .chip { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px;
      padding: 8px 11px; border-radius: 6px; text-decoration: none; font-weight: 650; }
    .regular, .original { background: #246e3b; color: white; }
    .bingo { background: #b62e35; color: white; }
    .anagram { background: #ffc364; color: #482b00; }
    .score { font-size: .8em; font-weight: 400; margin-left: 4px; opacity: .95; }
    .count { margin: 12px 0; }
    .combinations { border-color: #a9cbd5; }
    .combination-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-right: 12px; }
    .letter { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; min-height: 44px;
      background: #d9eaf1; color: #204c62; border-radius: 6px; font-weight: 700; }
    .notice { padding: 16px; margin: 16px 0; background: #fff3dc; border: 1px solid #d2a345; border-radius: 8px; }
    .loading { color: #3a6548; }
    .update { margin-bottom: 16px; }
    dialog { color: #20352c; max-width: min(700px, calc(100vw - 32px)); width: 100%;
      max-height: 85dvh; padding: 22px; border: 1px solid #a5b9ac; border-radius: 12px;
      box-shadow: 0 12px 50px #0003; font: inherit; }
    dialog::backdrop { background: #142b2280; }
    .dialog-heading { position: sticky; top: -22px; padding: 10px 0; background: white; }
    .legend { padding: 1px 5px; border-radius: 3px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 560px) {
      .search-row { flex-wrap: wrap; }
      .search-row #rack { flex-basis: 100%; }
      .search-row button[type="submit"] { flex: 1; }
      .panel { padding: 14px; }
      .result-heading { align-items: flex-start; }
    }
  `;
}

if (!customElements.get('skrafl-app')) customElements.define('skrafl-app', SkraflApp);
