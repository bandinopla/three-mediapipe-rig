//
// this file was coded with https://aistudio.google.com/
//

export interface PlayableItem {
  id: string;
  name: string;
}

export interface PlayerUIOptions<T> {
  container?: HTMLElement;
  onPlayChange?: (isPlaying: boolean) => void;
  onRecordChange?: (isRecording: boolean) => void;
  onItemSelect?: (item: T) => void;
  onPick?: () => void;
  onItemDelete?: (item: T) => void; 
  onRename?: (item: T) => void;
}

const ICONS = {
  play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  stop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  record: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`,
  recordStop: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>`,
  chevronUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
 
  delete: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  rename: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`
};

export class PlayerUI<T extends PlayableItem> {
  private container: HTMLElement;
  private root: HTMLElement;
  private options: PlayerUIOptions<T>;

  // State
  private _isPlaying = false;
  private _isRecording = false;
  private _items: T[] = [];
  private _activeId: string | null = null;
  private _isListOpen = false;

  // DOM References
  private refs!: {
    playBtn: HTMLButtonElement;
    recBtn: HTMLButtonElement; 
    displayBtn: HTMLButtonElement;
    titleSpan: HTMLSpanElement;
    popover: HTMLDivElement;
    listContainer: HTMLDivElement;
	deleteBtn: HTMLButtonElement; 
	renameBtn: HTMLButtonElement;
  };

  constructor(options: PlayerUIOptions<T> = {}) {
    this.options = options;
    this.container = options.container || document.body;
    
    this.root = document.createElement('div');
    this.root.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] select-none font-sans';
    this.buildDOM();
    this.attachEvents();
  }

  show() {
	this.container.appendChild(this.root);
  }

  hide() {
	this.container.removeChild(this.root);
  }

  // ==========================================
  // DOM Initialization
  // ==========================================

  private buildDOM() {
    this.root.innerHTML = `
      <div class="relative flex items-center gap-1.5 p-1.5 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/80 rounded-full shadow-2xl shadow-black/50 text-zinc-100 ring-1 ring-white/10">
        
        <!-- Play/Stop Button -->
        <button data-id="play" class="flex items-center justify-center w-10 h-10 rounded-full hover:bg-zinc-800 transition-all active:scale-95 text-zinc-100">
          ${ICONS.play}
        </button>
        
        <!-- Record/Stop Button -->
        <button data-id="rec" class="flex items-center justify-center w-10 h-10 rounded-full hover:bg-zinc-800 transition-all active:scale-95 text-zinc-400">
          ${ICONS.record}
        </button> 

        <div class="w-px h-6 bg-zinc-800 mx-1"></div>

        <!-- Display & Playlist Toggle -->
        <div class="relative">
          <button data-id="display" class="flex items-center gap-2 px-4 h-10 rounded-full hover:bg-zinc-800 transition-all active:scale-95 max-w-[200px] sm:max-w-[250px]">
            <span data-id="title" class="text-sm font-medium truncate">No clip selected</span>
            <span class="text-zinc-500 transition-transform duration-200" data-id="chevron">${ICONS.chevronUp}</span>
          </button>

          <!-- Playlist Popover -->
          <div data-id="popover" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden opacity-0 pointer-events-none transition-all translate-y-2 origin-bottom">
            <div class="p-3 border-b border-zinc-800/50 flex justify-between items-center bg-zinc-900/50">
              <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Available Clips</span>
            </div>
            <div data-id="list" class="max-h-64 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
              <!-- Items injected here -->
            </div>
          </div>
        </div>

		<!-- Rename clip -->
		<button data-id="rename" class="flex items-center justify-center w-10 h-10 rounded-full hover:bg-zinc-800 transition-all active:scale-95 text-zinc-400">
			${ICONS.rename}
		</button>

		<!-- Delete clip buton -->
		<button data-id="delete" class="flex items-center justify-center w-10 h-10 rounded-full hover:bg-zinc-800 transition-all active:scale-95 text-zinc-400">
			${ICONS.delete}
		</button>
 
      </div>
    `;

    this.refs = {
      playBtn: this.root.querySelector('[data-id="play"]') as HTMLButtonElement,
      recBtn: this.root.querySelector('[data-id="rec"]') as HTMLButtonElement,
      displayBtn: this.root.querySelector('[data-id="display"]') as HTMLButtonElement,
      titleSpan: this.root.querySelector('[data-id="title"]') as HTMLSpanElement,
      popover: this.root.querySelector('[data-id="popover"]') as HTMLDivElement,
      listContainer: this.root.querySelector('[data-id="list"]') as HTMLDivElement, 
	  deleteBtn: this.root.querySelector('[data-id="delete"]') as HTMLButtonElement, 
	  renameBtn: this.root.querySelector('[data-id="rename"]') as HTMLButtonElement,
    };

	this.refs.deleteBtn.classList.add("hidden"); 
	this.refs.renameBtn.classList.add("hidden");
  }

  private attachEvents() { 
    this.refs.playBtn.addEventListener('click', () => this.togglePlay());
    this.refs.recBtn.addEventListener('click', () => this.toggleRecord());
    this.refs.displayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleList();
    });
	this.refs.deleteBtn.addEventListener('click', () => this.delete()); 
	this.refs.renameBtn.addEventListener('click', () => this.rename());

    document.addEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (e: MouseEvent) => {
    if (this._isListOpen && !this.root.contains(e.target as Node)) {
      this.toggleList(false);
    }
  };

  // ==========================================
  // Public API (Syntax Sugar & Chainable)
  // ==========================================

  /** Mounts the UI to the DOM */
  public mount(container?: HTMLElement): this {
    if (container) this.container = container;
    if (!this.container.contains(this.root)) {
      this.container.appendChild(this.root);
    }
    this.renderList();
    this.updateDisplay();
    return this;
  }

  /** Unmounts and cleans up the UI */
  public destroy(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }

  // --- Playback Controls ---
 
  public play(): this { return this.setPlayState(true); }
  public stop(): this { return this.setPlayState(false); }
  public togglePlay(): this { return this.setPlayState(!this._isPlaying); }
  public delete(): this { return this.deleteItem(); }
  public rename(): this { 
		//
		// let the listener decide if this happens or not...
		//
		const item = this._items.find(i => i.id === this._activeId);
		if (!item) return this;

		this.options.onRename?.(item); 
		return this;
   }
  
  public setPlayState(isPlaying: boolean): this {
    if (this._isPlaying === isPlaying) return this;
	this.setRecordState(false);
    this._isPlaying = isPlaying;
    this.updatePlayBtn();
    if (this.options.onPlayChange) this.options.onPlayChange(this._isPlaying);
    return this;
  }

 

  public deleteItem(): this {
	if (this._activeId && this.options.onItemDelete) {
		//
		// let the listener decide if this happens or not...
		//
		const item = this._items.find(i => i.id === this._activeId);
		if (!item) return this;
		this.options.onItemDelete(item); 
	}
	return this;
  } 

  // --- Recording Controls ---

  public record(): this { return this.setRecordState(true); }
  public stopRecord(): this { return this.setRecordState(false); }
  public toggleRecord(): this { return this.setRecordState(!this._isRecording); }

  public setRecordState(isRecording: boolean): this {
    if (this._isRecording === isRecording) return this;
	this.setPlayState(false);
    this._isRecording = isRecording;
    this.updateRecBtn();
    if (this.options.onRecordChange) this.options.onRecordChange(this._isRecording);
    return this;
  }

  // --- Playlist Controls ---

  get items(){ return this._items; }
  get selectedItem(){
	return this._items.find(i => i.id === this._activeId);
  }

  public setItems(items: T[]): this {
    this._items = [...items];
    this.renderList();
    this.updateDisplay();
    return this;
  }

  public addItem(item: T): this {
    this._items.push(item);
    this.renderList();
    return this;
  }

  public removeItem(id: string): this {
    this._items = this._items.filter(i => i.id !== id);
    if (this._activeId === id) this.selectItem(null);
    this.renderList();
    return this;
  }

  public renameItem(id: string, newName: string): this {
    const item = this._items.find(i => i.id === id);
    if (item) {
      item.name = newName;
      this.renderList();
      if (this._activeId === id) this.updateDisplay();
    }
    return this;
  }

  public selectItem(id: string | null): this {
    this._activeId = id;
    this.updateDisplay();
    this.renderList();

	this.refs.deleteBtn.classList.remove("hidden"); 
	this.refs.renameBtn.classList.remove("hidden");
    
    if (id && this.options.onItemSelect) {
      const item = this._items.find(i => i.id === id);
      if (item) this.options.onItemSelect(item);
    }
    return this;
  }

  // ==========================================
  // Internal UI Updates
  // ==========================================

  private updatePlayBtn() {
    const { playBtn } = this.refs;
    playBtn.innerHTML = this._isPlaying ? ICONS.stop : ICONS.play;
    
    if (this._isPlaying) {
      playBtn.classList.add('text-emerald-400', 'bg-zinc-800/50');
      playBtn.classList.remove('text-zinc-100');
    } else {
      playBtn.classList.remove('text-emerald-400', 'bg-zinc-800/50');
      playBtn.classList.add('text-zinc-100');
    }
  }

  private updateRecBtn() {
    const { recBtn } = this.refs;
    recBtn.innerHTML = this._isRecording ? ICONS.recordStop : ICONS.record;
    
    if (this._isRecording) {
      recBtn.classList.add('text-red-500', 'animate-pulse', 'bg-red-500/10');
      recBtn.classList.remove('text-zinc-400');
    } else {
      recBtn.classList.remove('text-red-500', 'animate-pulse', 'bg-red-500/10');
      recBtn.classList.add('text-zinc-400');
    }
  }

  private updateDisplay() {
    const activeItem = this._items.find(i => i.id === this._activeId);
    this.refs.titleSpan.textContent = activeItem ? activeItem.name : 'No clip selected';
    if (activeItem) {
      this.refs.titleSpan.classList.add('text-zinc-100');
      this.refs.titleSpan.classList.remove('text-zinc-500');
    } else {
      this.refs.titleSpan.classList.add('text-zinc-500');
      this.refs.titleSpan.classList.remove('text-zinc-100');
    }
  }

  private toggleList(force?: boolean) {
    this._isListOpen = force !== undefined ? force : !this._isListOpen;
    const { popover, displayBtn } = this.refs;
    const chevron = displayBtn.querySelector('[data-id="chevron"]');

    if (this._isListOpen) {
      popover.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      displayBtn.classList.add('bg-zinc-800');
      if (chevron) chevron.classList.add('rotate-180');
    } else {
      popover.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
      displayBtn.classList.remove('bg-zinc-800');
      if (chevron) chevron.classList.remove('rotate-180');
    }
  }

  private renderList() {
    const { listContainer } = this.refs;
    listContainer.innerHTML = '';

    if (this._items.length === 0) {
      listContainer.innerHTML = `<div class="p-4 text-center text-sm text-zinc-500 italic">Playlist empty</div>`;
      return;
    }

    this._items.forEach(item => {
      const isActive = item.id === this._activeId;
      const btn = document.createElement('button');
      
      btn.className = `w-full text-left px-3 py-2.5 text-sm rounded-xl transition-all flex items-center justify-between group ${
        isActive 
          ? 'bg-zinc-800/80 text-zinc-100 shadow-sm' 
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`;
      
      btn.innerHTML = `
        <span class="truncate pr-3 font-medium">${item.name}</span>
        ${isActive ? `<span class="shrink-0 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>` : ''}
      `;
      
      btn.onclick = (e) => {
        e.stopPropagation();
        this.selectItem(item.id);
        this.toggleList(false);
      };
      
      listContainer.appendChild(btn);
    });
  }
}
