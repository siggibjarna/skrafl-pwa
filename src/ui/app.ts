import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { SearchResult } from '../engine/tabulator';
import { EngineClient } from '../worker/client';
import { matchesFilter, wordLengthBounds, type WordFilter } from './filter';

type Word = SearchResult['words'][number];

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
    filterContains: { state: true },
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
  declare private filterContains: string;
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
    this.filterContains = '';
    this.appliedFilter = { min: 1, max: 15, positions: [], contains: '' };
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
    window.history.replaceState({ rack: this.input }, '', url);
    if (this.input.trim()) void this.search(this.input, false);
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

  private readonly onPopState = (): void => {
    this.input = new URL(window.location.href).searchParams.get('rack') ?? '';
    if (this.input.trim()) {
      void this.search(this.input, false);
    } else {
      this.requestId++;
      this.result = null;
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

  private async search(value: string, push = true): Promise<void> {
    const input = value.trim();
    if (!input || !this.client) return;
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
    try {
      const result = await this.client.search(input);
      if (requestId !== this.requestId) return;
      this.result = result;
      this.bounds = wordLengthBounds([
        ...result.words,
        ...result.combinations.flatMap((group) => group.words),
      ]);
      this.clearFilters();
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

  private scheduleFilters(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.applyFilters(), 100);
  }

  private applyFilters(): void {
    const min = Number.parseInt(this.filterMin, 10);
    const max = Number.parseInt(this.filterMax, 10);
    this.appliedFilter = {
      min: Number.isNaN(min) ? this.bounds.min : min,
      max: Number.isNaN(max) ? this.bounds.max : Math.max(0, Math.min(this.bounds.max, max)),
      positions: [...this.positions],
      contains: this.filterContains,
    };
  }

  private clearFilters(): void {
    clearTimeout(this.filterTimer);
    this.filterMin = String(this.bounds.min);
    this.filterMax = String(this.bounds.max);
    this.positions = [];
    this.filterContains = '';
    this.applyFilters();
  }

  private renderFilters() {
    return html`
      <section class="panel filters" aria-label="Sía niðurstöður">
        <div class="filter-row">
          <span>Lengd:</span>
          <label class="sr-only" for="filter-min">Lágmarkslengd</label>
          <input id="filter-min" type="number" inputmode="numeric" min=${this.bounds.min}
            max=${this.bounds.max} placeholder="Frá" .value=${this.filterMin}
            @input=${(event: Event) => {
              this.filterMin = (event.target as HTMLInputElement).value;
              this.scheduleFilters();
            }}>
          <span aria-hidden="true">–</span>
          <label class="sr-only" for="filter-max">Hámarkslengd</label>
          <input id="filter-max" type="number" inputmode="numeric" min=${this.bounds.min}
            max=${this.bounds.max} placeholder="Til" .value=${this.filterMax}
            @input=${(event: Event) => {
              this.filterMax = (event.target as HTMLInputElement).value;
              this.scheduleFilters();
            }}>
        </div>
        <fieldset>
          <legend>Sæti:</legend>
          <div class="positions">
            ${repeat(Array.from({ length: this.positionCount }, (_, index) => index), (index) => index,
              (index) => html`<input class="position" type="text" maxlength="1"
                autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
                aria-label=${`Stafur í sæti ${index + 1}`} placeholder=${String(index + 1)}
                .value=${this.positions[index] ?? ''}
                @input=${(event: Event) => {
                  const positions = [...this.positions];
                  positions[index] = (event.target as HTMLInputElement).value;
                  this.positions = positions;
                  this.scheduleFilters();
                }}>`)}
          </div>
        </fieldset>
        <div class="filter-row">
          <label for="filter-contains">Inniheldur:</label>
          <input id="filter-contains" type="text" maxlength="7" placeholder="stafir"
            autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
            .value=${this.filterContains} @input=${(event: Event) => {
              this.filterContains = (event.target as HTMLInputElement).value;
              this.scheduleFilters();
            }}>
          <button type="button" class="secondary" @click=${this.clearFilters}>Hreinsa</button>
        </div>
      </section>`;
  }

  private renderWord(word: Word, combination = false) {
    const result = this.result!;
    const rackLength = result.rack.replace(/\s/g, '').replace(/^=/, '').length;
    const color = word.word.length >= 7 ? 'bingo'
      : word.word.length === rackLength ? 'anagram' : 'regular';
    const high = result.highwords.includes(word.word);
    return html`<a class="chip ${color}" href=${`?rack=${encodeURIComponent(word.word)}`}
      data-word=${word.word} @click=${(event: MouseEvent) => this.selectWord(event, word.word)}>
      ${high ? html`<span aria-label="Hæsta skor">★</span>` : nothing}
      ${word.word}${!combination ? html`<span class="score">${word.score}</span>` : nothing}
    </a>`;
  }

  private renderResults() {
    const result = this.result;
    if (!result) return nothing;
    if (!result.ok) return html`<p class="notice" role="alert">${result.error ?? 'Ekki tókst að leita.'}</p>`;
    const words = result.words.filter(({ word }) => matchesFilter(word, this.appliedFilter));
    const groups = result.combinations.map((group) => ({
      ...group,
      words: group.words.filter(({ word }) => matchesFilter(word, this.appliedFilter)),
    }));
    const combinationTotal = result.combinations.reduce((total, group) => total + group.words.length, 0);
    const combinationShown = groups.reduce((total, group) => total + group.words.length, 0);
    return html`
      ${result.words.length || combinationTotal ? this.renderFilters() : nothing}
      <section class="panel" aria-labelledby="results-heading">
        <div class="result-heading">
          <h2 id="results-heading">
            <a class="chip original" href=${`?rack=${encodeURIComponent(result.rack.replace(/\s/g, ''))}`}
              @click=${(event: MouseEvent) => this.selectWord(event, result.rack.replace(/\s/g, ''))}>
              ${result.valid ? html`<span aria-label="Leyfilegt orð">✓</span>` : nothing}
              ${result.rack}
            </a>
          </h2>
          <span>hæsta skor <span aria-label="stjarna">★</span> <strong>${result.highscore}</strong></span>
        </div>
        <p class="count" aria-live="polite">Orð: ${words.length} / ${result.words.length}</p>
        <div class="word-list">
          ${words.map((word) => this.renderWord(word))}
        </div>
        ${!result.words.length ? html`<p>Engin orð fundust.</p>`
          : !words.length ? html`<p>Engin orð passa við síuna.</p>` : nothing}
      </section>
      ${combinationTotal ? html`
        <section class="panel combinations" aria-labelledby="combinations-heading">
          <h2 id="combinations-heading">Að viðbættum einum staf</h2>
          <p class="count" aria-live="polite">Samsetningar: ${combinationShown} / ${combinationTotal}</p>
          <div class="word-list">
            ${groups.filter((group) => group.words.length).map((group) => html`
              <div class="combination-group">
                <span class="letter" aria-label=${`Viðbættur stafur ${group.letter}`}>${group.letter}</span>
                ${group.words.map((word) => this.renderWord(word, true))}
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
      <p>Síurnar gilda um báða orðalista. Lengd velur stystu og lengstu orð, Sæti festir staf
        á ákveðnum stað og Inniheldur krefst allra tilgreindra stafa, líka endurtekinna stafa.</p>
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
                autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
                enterkeyhint="search" placeholder="Stafir, ? eða =mynstur" .value=${this.input}
                @input=${(event: Event) => { this.input = (event.target as HTMLInputElement).value; }}>
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
    input[type=number] { width: 76px; }
    #filter-contains { width: 105px; }
    fieldset { margin: 0; padding: 0; border: 0; min-width: 0; flex: 1 1 100%; }
    legend { padding: 0; margin-bottom: 6px; }
    .positions { display: flex; gap: 5px; flex-wrap: wrap; }
    input.position { width: 44px; text-align: center; padding: 8px 2px; }
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
      .search-row { flex-direction: column; }
      .search-row button { width: 100%; }
      .panel { padding: 14px; }
      .result-heading { align-items: flex-start; }
    }
  `;
}

if (!customElements.get('skrafl-app')) customElements.define('skrafl-app', SkraflApp);
