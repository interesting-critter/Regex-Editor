import type { SpindleFrontendContext, SpindleSelectHandle } from 'lumiverse-spindle-types'
import { showDiffPreviewModal, type FieldDiffItem } from './diff-modal'
import { PipelineManagerUI, runPipelineOnText } from './pipeline-manager'
import type { RegexPreset } from './pipeline-types'

const CHAR_FIELDS = [
  { key: 'first_mes', label: 'First Message' },
  { key: 'alternate_greetings', label: 'Alternate Greetings' },
  { key: 'description', label: 'Description' },
  { key: 'personality', label: 'Personality' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'mes_example', label: 'Example Dialogue' },
  { key: 'system_prompt', label: 'System Prompt' },
  { key: 'post_history_instructions', label: 'Post-History' },
  { key: 'creator_notes', label: 'Creator Notes' },
] as const

type SourceMode = 'character' | 'lorebook' | 'custom'
type TabView = 'editor' | 'pipelines'

interface FieldItem {
  id: string
  key: string
  label: string
  value: string
  sublabel?: string
}

interface RegexMatch {
  fieldId: string
  fieldIndex: number
  startIndex: number
  length: number
  text: string
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function setup(ctx: SpindleFrontendContext) {
  let activeTabView: TabView = 'editor'
  let currentSourceMode: SourceMode = 'character'
  let isPresetRunMode = false

  let characters: Array<{ id: string; name: string }> = []
  let worldBooks: Array<{ id: string; name: string }> = []
  let presets: RegexPreset[] = []
  let selectedPresetId = ''

  let selectedChar: any = null
  let selectedWorldBookEntries: any[] = []
  let selectedItemId = ''
  let selectComponent: SpindleSelectHandle | null = null
  let pipelineUI: PipelineManagerUI | null = null

  let fields: FieldItem[] = []
  const enabledFields = new Set<string>([
    'first_mes',
    'alternate_greetings',
    'description',
    'personality',
    'scenario',
  ])

  // Single Regex & Navigation State
  let useRegex = true
  let previewDiffEnabled = true
  const flags = { g: true, i: false, m: true, s: true }
  let currentMatches: RegexMatch[] = []
  let currentMatchIndex = -1

  // Undo / Redo History Stack
  let historyStack: FieldItem[][] = [[]]
  let historyIndex = 0
  const MAX_HISTORY = 100
  let typingTimer: ReturnType<typeof setTimeout> | null = null

  // ── Register Drawer Tab ──
  const tab = ctx.ui.registerDrawerTab({
    id: 'regex_studio',
    title: 'Regex Studio',
    shortName: 'Rgx Studio',
    description: 'Multi-field regex & pipeline editor for cards, lorebooks, and custom text',
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
  })

  // ── Styles ──
  const removeStyle = ctx.dom.addStyle(`
    .rs-container { display: flex; flex-direction: column; gap: 10px; padding: 12px; font-size: 13px; color: var(--lumiverse-text); }
    .rs-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .rs-header-title { font-weight: 600; font-size: 13.5px; }
    .rs-input { background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 6px 10px; font-size: 12px; outline: none; box-sizing: border-box; }
    .rs-input:focus { border-color: var(--lumiverse-accent); }
    .rs-btn { background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 5px 10px; font-size: 12px; cursor: pointer; transition: background 0.15s; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; }
    .rs-btn:hover:not(:disabled) { background: var(--lumiverse-border); }
    .rs-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .rs-btn-primary { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border: 1px solid var(--lumiverse-accent); }
    .rs-btn-primary:hover:not(:disabled) { opacity: 0.9; }
    
    .rs-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: 12px; cursor: pointer; user-select: none; font-weight: 500; }
    .rs-chip.active { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border-color: var(--lumiverse-accent); }
    .rs-chip.disabled { opacity: 0.4; cursor: not-allowed; }
    
    .rs-card { background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .rs-fields-list { display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow-y: auto; padding-right: 2px; }
    
    .rs-field-box { background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
    .rs-field-header { background: var(--lumiverse-fill-subtle); padding: 6px 10px; font-size: 11.5px; font-weight: 600; color: var(--lumiverse-text); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--lumiverse-border); }
    .rs-field-sub { font-size: 10.5px; font-weight: normal; color: var(--lumiverse-text-dim); }
    
    .rs-field-textarea { width: 100%; min-height: 250px; height: 250px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.45; background: transparent; color: var(--lumiverse-text); border: none; padding: 8px 10px; resize: vertical; box-sizing: border-box; outline: none; }
    .rs-field-textarea:focus { background: var(--lumiverse-fill-subtle); }
    .rs-field-textarea::selection { background: var(--rs-highlight-color, rgba(109, 93, 252, 0.45)); color: inherit; }

    .rs-color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--lumiverse-border); cursor: pointer; padding: 0; background: none; -webkit-appearance: none; appearance: none; }
    .rs-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
    .rs-color-swatch::-webkit-color-swatch { border: none; border-radius: 50%; }

    .rs-nav-tabs { display: flex; border-bottom: 1px solid var(--lumiverse-border); margin-bottom: 4px; }
    .rs-nav-tab { padding: 6px 14px; font-weight: 600; font-size: 12.5px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--lumiverse-text-dim); }
    .rs-nav-tab.active { color: var(--lumiverse-accent); border-bottom-color: var(--lumiverse-accent); }
  `)

  // ── Render HTML Shell ──
  tab.root.innerHTML = `
    <div class="rs-container">
      <!-- Top Navigation Tabs (Editor vs Pipelines) -->
      <div class="rs-nav-tabs">
        <div class="rs-nav-tab active" id="rs-tab-editor">Editor</div>
        <div class="rs-nav-tab" id="rs-tab-pipelines">Pipelines & Presets</div>
      </div>

      <!-- ── TAB VIEW 1: EDITOR ── -->
      <div id="rs-view-editor" style="display: flex; flex-direction: column; gap: 10px;">
        <div class="rs-row">
          <label class="rs-header-title">Source:</label>
          <button class="rs-btn rs-btn-primary" id="rs-mode-char">Character Card</button>
          <button class="rs-btn" id="rs-mode-lore">Lorebook</button>
          <button class="rs-btn" id="rs-mode-custom">Custom Text</button>
        </div>

        <!-- Searchable Select Slot -->
        <div id="rs-selector-section" class="rs-row" style="align-items: stretch;">
          <div id="rs-select-slot" style="flex: 1; min-width: 200px;"></div>
          <button class="rs-btn" id="rs-refresh-btn">Refresh</button>
        </div>

        <!-- Field Filter Chips -->
        <div id="rs-fields-filter" class="rs-card">
          <div style="font-weight: 500; font-size: 11.5px;">Include Fields in Editor:</div>
          <div class="rs-row" id="rs-chips-container"></div>
        </div>

        <!-- Action Toolbar -->
        <div class="rs-row" style="justify-content: space-between;">
          <div class="rs-row">
            <button class="rs-btn" id="rs-undo-btn" title="Undo change" disabled>↶ Undo</button>
            <button class="rs-btn" id="rs-redo-btn" title="Redo change" disabled>↷ Redo</button>
          </div>
          <div class="rs-row">
            <button class="rs-btn" id="rs-copy-btn">Copy All</button>
            <button class="rs-btn" id="rs-reset-btn">Reset All</button>
            <button class="rs-btn rs-btn-primary" id="rs-save-btn">Save Changes</button>
          </div>
        </div>

        <!-- Regex / Pipeline Runner Card -->
        <div class="rs-card" id="rs-regex-card">
          <!-- TOP HEADER of Regex Card: Flags, Controls & Mode Toggle -->
          <div class="rs-row" style="justify-content: space-between;">
            <div class="rs-row" id="rs-single-regex-flags">
              <label class="rs-chip active" id="rs-toggle-regex" title="Toggle Regular Expressions">.* Regex</label>
              <span style="font-size: 11px; color: var(--lumiverse-text-dim); margin-left: 2px;">Flags:</span>
              <label class="rs-chip active" id="rs-flag-g" title="Global match">g</label>
              <label class="rs-chip" id="rs-flag-i" title="Case insensitive">i</label>
              <label class="rs-chip active" id="rs-flag-m" title="Multiline">m</label>
              <label class="rs-chip active" id="rs-flag-s" title="Dot matches newline">s</label>
              <span style="font-size: 11px; color: var(--lumiverse-text-dim); margin-left: 4px;">Highlight:</span>
              <input type="color" id="rs-color-picker" class="rs-color-swatch" value="#6d5dfc" title="Change match highlight color" />
            </div>

            <!-- Mode Switcher between Single Regex and Pipeline Preset -->
            <button class="rs-btn" id="rs-toggle-mode-btn" style="font-weight: 600; font-size: 11px;">⇄ Presets</button>
          </div>

          <!-- SINGLE REGEX INPUTS -->
          <div id="rs-single-inputs-row" class="rs-row">
            <input type="text" id="rs-regex-find" class="rs-input" placeholder="Find text..." style="flex: 1; min-width: 140px;" />
            <input type="text" id="rs-regex-replace" class="rs-input" placeholder="Replace with..." style="flex: 1; min-width: 140px;" />
          </div>

          <!-- PRESET RUNNER ROW (Hidden by default) -->
          <div id="rs-preset-inputs-row" class="rs-row" style="display: none;">
            <select id="rs-runner-preset-select" class="rs-input" style="flex: 1;">
              <option value="">-- Choose Pipeline Preset to Run --</option>
            </select>
            <button class="rs-btn" id="rs-goto-pipeline-btn" title="Open in Pipeline Editor">Edit Preset</button>
          </div>

          <!-- BOTTOM ACTIONS of Regex Card -->
          <div class="rs-row" style="justify-content: flex-end;">
            <div id="rs-single-match-nav" class="rs-row" style="margin-right: auto;">
              <span id="rs-match-count" style="font-size: 11px; color: var(--lumiverse-text-dim);">No matches</span>
              <button class="rs-btn" id="rs-prev-match-btn" title="Previous Match" disabled>◀</button>
              <button class="rs-btn" id="rs-next-match-btn" title="Next Match" disabled>▶</button>
              <button class="rs-btn" id="rs-replace-one-btn" title="Replace Current Match" disabled>Replace</button>
            </div>
            
            <button class="rs-btn rs-btn-primary" id="rs-replace-all-btn">Replace All</button>
            <label class="rs-chip active" id="rs-toggle-diff" title="Show diff preview before applying Replace All" style="margin-left: 4px;">Diff Preview</label>
          </div>
        </div>

        <!-- Multi-Field Text Area Container -->
        <div id="rs-fields-container" class="rs-fields-list">
          <div style="text-align: center; color: var(--lumiverse-text-dim); padding: 24px;">
            Choose a Character Card or Lorebook above to display editable fields.
          </div>
        </div>
      </div>

      <!-- ── TAB VIEW 2: PIPELINES & PRESETS BUILDER ── -->
      <div id="rs-view-pipelines" style="display: none;"></div>
    </div>
  `

  // ── Element Handles ──
  const tabEditor = tab.root.querySelector('#rs-tab-editor') as HTMLElement
  const tabPipelines = tab.root.querySelector('#rs-tab-pipelines') as HTMLElement
  const viewEditor = tab.root.querySelector('#rs-view-editor') as HTMLElement
  const viewPipelines = tab.root.querySelector('#rs-view-pipelines') as HTMLElement

  const modeCharBtn = tab.root.querySelector('#rs-mode-char') as HTMLButtonElement
  const modeLoreBtn = tab.root.querySelector('#rs-mode-lore') as HTMLButtonElement
  const modeCustomBtn = tab.root.querySelector('#rs-mode-custom') as HTMLButtonElement
  const selectorSection = tab.root.querySelector('#rs-selector-section') as HTMLElement
  const selectSlot = tab.root.querySelector('#rs-select-slot') as HTMLElement
  const refreshBtn = tab.root.querySelector('#rs-refresh-btn') as HTMLButtonElement
  const fieldsFilterCard = tab.root.querySelector('#rs-fields-filter') as HTMLElement
  const chipsContainer = tab.root.querySelector('#rs-chips-container') as HTMLElement

  const toggleModeBtn = tab.root.querySelector('#rs-toggle-mode-btn') as HTMLButtonElement
  const singleFlagsRow = tab.root.querySelector('#rs-single-regex-flags') as HTMLElement
  const singleInputsRow = tab.root.querySelector('#rs-single-inputs-row') as HTMLElement
  const singleMatchNav = tab.root.querySelector('#rs-single-match-nav') as HTMLElement
  const presetInputsRow = tab.root.querySelector('#rs-preset-inputs-row') as HTMLElement
  const runnerPresetSelect = tab.root.querySelector('#rs-runner-preset-select') as HTMLSelectElement
  const gotoPipelineBtn = tab.root.querySelector('#rs-goto-pipeline-btn') as HTMLButtonElement

  const regexFindInput = tab.root.querySelector('#rs-regex-find') as HTMLInputElement
  const regexReplaceInput = tab.root.querySelector('#rs-regex-replace') as HTMLInputElement
  const regexToggleBtn = tab.root.querySelector('#rs-toggle-regex') as HTMLElement
  const diffToggleBtn = tab.root.querySelector('#rs-toggle-diff') as HTMLElement
  const flagGEl = tab.root.querySelector('#rs-flag-g') as HTMLElement
  const flagMEl = tab.root.querySelector('#rs-flag-m') as HTMLElement
  const flagSEl = tab.root.querySelector('#rs-flag-s') as HTMLElement
  const colorPicker = tab.root.querySelector('#rs-color-picker') as HTMLInputElement
  const matchCountSpan = tab.root.querySelector('#rs-match-count') as HTMLElement
  const prevMatchBtn = tab.root.querySelector('#rs-prev-match-btn') as HTMLButtonElement
  const nextMatchBtn = tab.root.querySelector('#rs-next-match-btn') as HTMLButtonElement
  const replaceOneBtn = tab.root.querySelector('#rs-replace-one-btn') as HTMLButtonElement
  const replaceAllBtn = tab.root.querySelector('#rs-replace-all-btn') as HTMLButtonElement
  const fieldsContainer = tab.root.querySelector('#rs-fields-container') as HTMLElement

  const undoBtn = tab.root.querySelector('#rs-undo-btn') as HTMLButtonElement
  const redoBtn = tab.root.querySelector('#rs-redo-btn') as HTMLButtonElement
  const copyBtn = tab.root.querySelector('#rs-copy-btn') as HTMLButtonElement
  const resetBtn = tab.root.querySelector('#rs-reset-btn') as HTMLButtonElement
  const saveBtn = tab.root.querySelector('#rs-save-btn') as HTMLButtonElement

  // Initialize Pipeline UI
  pipelineUI = new PipelineManagerUI(ctx, viewPipelines)

  // ── Switch Main Drawer Tabs (Editor vs Pipelines) ──
  function switchTabView(view: TabView) {
    activeTabView = view
    tabEditor.classList.toggle('active', view === 'editor')
    tabPipelines.classList.toggle('active', view === 'pipelines')
    viewEditor.style.display = view === 'editor' ? 'flex' : 'none'
    viewPipelines.style.display = view === 'pipelines' ? 'flex' : 'none'
  }

  tabEditor.onclick = () => switchTabView('editor')
  tabPipelines.onclick = () => switchTabView('pipelines')

  gotoPipelineBtn.onclick = () => {
    if (selectedPresetId) pipelineUI?.selectPresetById(selectedPresetId)
    switchTabView('pipelines')
  }

  // ── Switch Single Regex vs Preset Runner in Editor ──
  function setPresetRunMode(enabled: boolean) {
    isPresetRunMode = enabled
    toggleModeBtn.textContent = isPresetRunMode ? '⇄ Switch to Single Regex' : '⇄ Switch to Presets'
    singleFlagsRow.style.visibility = isPresetRunMode ? 'hidden' : 'visible'
    singleInputsRow.style.display = isPresetRunMode ? 'none' : 'flex'
    singleMatchNav.style.display = isPresetRunMode ? 'none' : 'flex'
    presetInputsRow.style.display = isPresetRunMode ? 'flex' : 'none'
    replaceAllBtn.textContent = isPresetRunMode ? 'Run Pipeline' : 'Replace All'
    if (!isPresetRunMode) scanMatches({ shouldFocus: false })
  }

  toggleModeBtn.onclick = () => setPresetRunMode(!isPresetRunMode)

  runnerPresetSelect.onchange = () => {
    selectedPresetId = runnerPresetSelect.value
  }

  function updateRunnerPresetDropdown() {
    runnerPresetSelect.innerHTML = '<option value="">-- Choose Pipeline Preset to Run --</option>'
    presets.forEach((p) => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = `${p.name} (${p.steps.length} steps)`
      runnerPresetSelect.appendChild(opt)
    })
    if (selectedPresetId) runnerPresetSelect.value = selectedPresetId
  }

  // ── Undo / Redo History Stack ──
  function cloneFields(arr: FieldItem[]): FieldItem[] {
    return arr.map((f) => ({ ...f }))
  }

  function pushHistory(newFields: FieldItem[]) {
    historyStack = historyStack.slice(0, historyIndex + 1)
    historyStack.push(cloneFields(newFields))
    if (historyStack.length > MAX_HISTORY) {
      historyStack.shift()
    } else {
      historyIndex++
    }
    updateHistoryButtons()
  }

  function updateHistoryButtons() {
    undoBtn.disabled = historyIndex <= 0
    redoBtn.disabled = historyIndex >= historyStack.length - 1
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--
      fields = cloneFields(historyStack[historyIndex])
      updateDomTextareasFromState()
      updateHistoryButtons()
      scanMatches({ shouldFocus: false })
    }
  }

  function redo() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++
      fields = cloneFields(historyStack[historyIndex])
      updateDomTextareasFromState()
      updateHistoryButtons()
      scanMatches({ shouldFocus: false })
    }
  }

  function resetHistory(initialFields: FieldItem[]) {
    historyStack = [cloneFields(initialFields)]
    historyIndex = 0
    updateHistoryButtons()
  }

  // ── Highlight Color ──
  function setHighlightColor(hexColor: string) {
    tab.root.style.setProperty('--rs-highlight-color', `${hexColor}77`)
  }
  colorPicker.oninput = () => setHighlightColor(colorPicker.value)
  setHighlightColor(colorPicker.value)

  // ── Native Searchable Select ──
  selectComponent = ctx.components.mountSelect(selectSlot, {
    value: '',
    placeholder: 'Search and choose a Character...',
    searchPlaceholder: 'Search by name...',
    searchThreshold: 1,
    options: [],
    onChange: (id) => {
      selectedItemId = id
      if (!id) return
      if (currentSourceMode === 'character') {
        ctx.sendToBackend({ type: 'get_character', characterId: id })
      } else if (currentSourceMode === 'lorebook') {
        ctx.sendToBackend({ type: 'get_world_book', worldBookId: id })
      }
    },
  })

  // ── Field Filter Chips ──
  CHAR_FIELDS.forEach((f) => {
    const chip = document.createElement('span')
    chip.className = `rs-chip ${enabledFields.has(f.key) ? 'active' : ''}`
    chip.textContent = f.label
    chip.onclick = () => {
      if (enabledFields.has(f.key)) {
        enabledFields.delete(f.key)
        chip.classList.remove('active')
      } else {
        enabledFields.add(f.key)
        chip.classList.add('active')
      }
      if (selectedChar) buildCharacterFields()
    }
    chipsContainer.appendChild(chip)
  })

  // ── Diff Preview Toggle ──
  diffToggleBtn.onclick = () => {
    previewDiffEnabled = !previewDiffEnabled
    diffToggleBtn.classList.toggle('active', previewDiffEnabled)
  }

  // ── Single Regex Toggle & Flags ──
  function updateRegexModeUI() {
    regexToggleBtn.classList.toggle('active', useRegex)
    regexFindInput.placeholder = useRegex ? 'Find Regex (e.g. \\*[\\s\\S]*?\\*)' : 'Find plain text...'
    regexReplaceInput.placeholder = useRegex ? 'Replace (e.g. $1 or empty)' : 'Replace text...'
    flagGEl.classList.toggle('disabled', !useRegex)
    flagMEl.classList.toggle('disabled', !useRegex)
    flagSEl.classList.toggle('disabled', !useRegex)
    scanMatches({ shouldFocus: false })
  }

  regexToggleBtn.onclick = () => {
    useRegex = !useRegex
    updateRegexModeUI()
  }

  ;(['g', 'i', 'm', 's'] as const).forEach((f) => {
    const el = tab.root.querySelector(`#rs-flag-${f}`) as HTMLElement
    el.onclick = () => {
      if (!useRegex && (f === 'm' || f === 's' || f === 'g')) return
      flags[f] = !flags[f]
      el.classList.toggle('active', flags[f])
      scanMatches({ shouldFocus: false })
    }
  })

  // ── Multi-Field DOM Renderer ──
  function renderFieldsDOM() {
    fieldsContainer.innerHTML = ''

    if (fields.length === 0) {
      fieldsContainer.innerHTML = `
        <div style="text-align: center; color: var(--lumiverse-text-dim); padding: 24px;">
          ${currentSourceMode === 'custom' ? 'Type in the box below.' : 'No active fields selected.'}
        </div>
      `
      return
    }

    fields.forEach((field) => {
      const box = document.createElement('div')
      box.className = 'rs-field-box'

      const header = document.createElement('div')
      header.className = 'rs-field-header'
      header.innerHTML = `
        <span>${field.label}</span>
        ${field.sublabel ? `<span class="rs-field-sub">${field.sublabel}</span>` : ''}
      `

      const textarea = document.createElement('textarea')
      textarea.className = 'rs-field-textarea'
      textarea.value = field.value
      textarea.dataset.fieldId = field.id
      textarea.placeholder = `Enter ${field.label.toLowerCase()} here...`

      textarea.oninput = () => {
        field.value = textarea.value
        scanMatches({ shouldFocus: false })

        if (typingTimer) clearTimeout(typingTimer)
        typingTimer = setTimeout(() => {
          pushHistory(fields)
        }, 600)
      }

      box.appendChild(header)
      box.appendChild(textarea)
      fieldsContainer.appendChild(box)
    })

    scanMatches({ shouldFocus: false })
  }

  function updateDomTextareasFromState() {
    fields.forEach((field) => {
      const ta = fieldsContainer.querySelector(`[data-field-id="${field.id}"]`) as HTMLTextAreaElement | null
      if (ta && ta.value !== field.value) {
        ta.value = field.value
      }
    })
  }

  // ── Build Field Models from Entities ──
  function buildCharacterFields() {
    if (!selectedChar) return
    const newFields: FieldItem[] = []

    for (const f of CHAR_FIELDS) {
      if (!enabledFields.has(f.key)) continue

      if (f.key === 'alternate_greetings') {
        const altGreetings: string[] = Array.isArray(selectedChar.alternate_greetings)
          ? selectedChar.alternate_greetings
          : []
        altGreetings.forEach((greeting, idx) => {
          newFields.push({
            id: `alt_greeting_${idx}`,
            key: 'alternate_greetings',
            label: `Alternate Greeting ${idx + 1}`,
            value: greeting || '',
          })
        })
      } else {
        newFields.push({
          id: f.key,
          key: f.key,
          label: f.label,
          value: selectedChar[f.key] || '',
        })
      }
    }

    fields = newFields
    renderFieldsDOM()
    resetHistory(fields)
  }

  function buildWorldBookFields() {
    fields = selectedWorldBookEntries.map((entry, idx) => ({
      id: entry.id,
      key: 'entry',
      label: entry.comment || `Entry ${idx + 1}`,
      sublabel: `ID: ${entry.id}`,
      value: entry.content || '',
    }))

    renderFieldsDOM()
    resetHistory(fields)
  }

  function buildCustomField() {
    fields = [
      {
        id: 'custom_scratchpad',
        key: 'custom',
        label: 'Custom Text Editor',
        value: fields[0]?.value || '',
      },
    ]
    renderFieldsDOM()
    resetHistory(fields)
  }

  // ── Unified Regex Engine across all Fields ──
  function getActiveRegExp(): RegExp | null {
    const pattern = regexFindInput.value
    if (!pattern) return null
    try {
      if (!useRegex) {
        return new RegExp(escapeRegExp(pattern), flags.i ? 'gi' : 'g')
      }
      let flagStr = ''
      if (flags.g) flagStr += 'g'
      if (flags.i) flagStr += 'i'
      if (flags.m) flagStr += 'm'
      if (flags.s) flagStr += 's'
      return new RegExp(pattern, flagStr)
    } catch {
      return null
    }
  }

  function scanMatches(opts: { shouldFocus?: boolean; preserveIndex?: boolean } = {}) {
    if (isPresetRunMode) return
    const rx = getActiveRegExp()
    currentMatches = []

    if (!rx || fields.length === 0) {
      currentMatchIndex = -1
      updateMatchUI(opts.shouldFocus ?? false)
      return
    }

    const execRx = rx.global ? rx : new RegExp(rx.source, rx.flags + 'g')

    fields.forEach((field, fieldIndex) => {
      let match: RegExpExecArray | null
      execRx.lastIndex = 0

      while ((match = execRx.exec(field.value)) !== null) {
        currentMatches.push({
          fieldId: field.id,
          fieldIndex,
          startIndex: match.index,
          length: match[0].length,
          text: match[0],
        })
        if (match.index === execRx.lastIndex) {
          execRx.lastIndex++
        }
      }
    })

    if (!opts.preserveIndex || currentMatchIndex >= currentMatches.length) {
      currentMatchIndex = currentMatches.length > 0 ? 0 : -1
    }

    updateMatchUI(opts.shouldFocus ?? false)
  }

  function updateMatchUI(shouldFocus: boolean) {
    const total = currentMatches.length
    if (total === 0) {
      matchCountSpan.textContent = 'No matches'
      prevMatchBtn.disabled = true
      nextMatchBtn.disabled = true
      replaceOneBtn.disabled = true
    } else {
      matchCountSpan.textContent = `${currentMatchIndex + 1} of ${total}`
      prevMatchBtn.disabled = false
      nextMatchBtn.disabled = false
      replaceOneBtn.disabled = false
      if (shouldFocus) {
        highlightCurrentMatch()
      }
    }
  }

  function highlightCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return
    const match = currentMatches[currentMatchIndex]
    const textarea = fieldsContainer.querySelector(`[data-field-id="${match.fieldId}"]`) as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(match.startIndex, match.startIndex + match.length)
      textarea.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  function nextMatch() {
    if (currentMatches.length === 0) return
    currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length
    updateMatchUI(true)
  }

  function prevMatch() {
    if (currentMatches.length === 0) return
    currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length
    updateMatchUI(true)
  }

  function replaceSingleMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return
    const match = currentMatches[currentMatchIndex]
    const field = fields[match.fieldIndex]
    const rx = getActiveRegExp()
    if (!rx || !field) return

    const replacePattern = regexReplaceInput.value
    const matchedSubstring = field.value.slice(match.startIndex, match.startIndex + match.length)

    const replaced = useRegex
      ? matchedSubstring.replace(rx, replacePattern)
      : replacePattern

    field.value = field.value.slice(0, match.startIndex) + replaced + field.value.slice(match.startIndex + match.length)

    updateDomTextareasFromState()
    pushHistory(fields)
    scanMatches({ shouldFocus: true, preserveIndex: true })
  }

  function applyReplaceAll(diffItems: FieldDiffItem[]) {
    diffItems.forEach((diff) => {
      const field = fields.find((f) => f.id === diff.fieldId)
      if (field) field.value = diff.newValue
    })

    updateDomTextareasFromState()
    pushHistory(fields)
    scanMatches({ shouldFocus: false })
  }

  function handleReplaceAllClick() {
    if (fields.length === 0) return

    let diffItems: FieldDiffItem[] = []

    if (isPresetRunMode) {
      // ── Pipeline Preset Mode Execution (in order) ──
      const preset = presets.find((p) => p.id === runnerPresetSelect.value)
      if (!preset || preset.steps.length === 0) {
        return
      }

      diffItems = fields.map((field) => ({
        fieldId: field.id,
        label: field.label,
        sublabel: field.sublabel,
        oldValue: field.value,
        newValue: runPipelineOnText(field.value, preset.steps),
      }))
    } else {
      // ── Single Regex Mode Execution ──
      const rx = getActiveRegExp()
      if (!rx) return
      const replaceStr = regexReplaceInput.value

      diffItems = fields.map((field) => {
        const newValue = useRegex
          ? field.value.replace(rx, replaceStr)
          : field.value.replace(rx, () => replaceStr)

        return {
          fieldId: field.id,
          label: field.label,
          sublabel: field.sublabel,
          oldValue: field.value,
          newValue,
        }
      })
    }

    if (previewDiffEnabled) {
      const opened = showDiffPreviewModal(ctx, diffItems, () => applyReplaceAll(diffItems))
      if (!opened) scanMatches({ shouldFocus: false })
    } else {
      applyReplaceAll(diffItems)
    }
  }

  // ── Source Mode Switching ──
  function setSourceMode(mode: SourceMode) {
    currentSourceMode = mode
    modeCharBtn.className = `rs-btn ${mode === 'character' ? 'rs-btn-primary' : ''}`
    modeLoreBtn.className = `rs-btn ${mode === 'lorebook' ? 'rs-btn-primary' : ''}`
    modeCustomBtn.className = `rs-btn ${mode === 'custom' ? 'rs-btn-primary' : ''}`

    if (mode === 'custom') {
      selectorSection.style.display = 'none'
      fieldsFilterCard.style.display = 'none'
      saveBtn.style.display = 'none'
      buildCustomField()
    } else {
      selectorSection.style.display = 'flex'
      saveBtn.style.display = 'inline-block'
      fieldsFilterCard.style.display = mode === 'character' ? 'flex' : 'none'
      selectedItemId = ''
      updateSelectOptions()
      fetchList()
    }
  }

  function updateSelectOptions() {
    if (!selectComponent) return
    if (currentSourceMode === 'character') {
      selectComponent.update({
        value: selectedItemId,
        placeholder: `Choose from ${characters.length} characters...`,
        searchPlaceholder: 'Search character name...',
        options: characters.map((c) => ({ value: c.id, label: c.name })),
      })
    } else if (currentSourceMode === 'lorebook') {
      selectComponent.update({
        value: selectedItemId,
        placeholder: `Choose from ${worldBooks.length} lorebooks...`,
        searchPlaceholder: 'Search lorebook name...',
        options: worldBooks.map((b) => ({ value: b.id, label: b.name })),
      })
    }
  }

  function fetchList() {
    if (currentSourceMode === 'character') {
      ctx.sendToBackend({ type: 'list_characters' })
    } else if (currentSourceMode === 'lorebook') {
      ctx.sendToBackend({ type: 'list_world_books' })
    }
  }

  // ── Event Handlers ──
  modeCharBtn.onclick = () => setSourceMode('character')
  modeLoreBtn.onclick = () => setSourceMode('lorebook')
  modeCustomBtn.onclick = () => setSourceMode('custom')
  refreshBtn.onclick = () => fetchList()

  regexFindInput.oninput = () => scanMatches({ shouldFocus: false })

  regexFindInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prevMatch()
      else nextMatch()
    }
  }

  undoBtn.onclick = () => undo()
  redoBtn.onclick = () => redo()

  nextMatchBtn.onclick = () => nextMatch()
  prevMatchBtn.onclick = () => prevMatch()
  replaceOneBtn.onclick = () => replaceSingleMatch()
  replaceAllBtn.onclick = () => handleReplaceAllClick()

  resetBtn.onclick = () => {
    if (currentSourceMode === 'character' && selectedChar) buildCharacterFields()
    else if (currentSourceMode === 'lorebook') buildWorldBookFields()
    else buildCustomField()
  }

  copyBtn.onclick = () => {
    const combined = fields.map((f) => `[${f.label}]\n${f.value}`).join('\n\n')
    navigator.clipboard.writeText(combined)
  }

  saveBtn.onclick = () => {
    if (currentSourceMode === 'character' && selectedChar) {
      const patch: Record<string, any> = {}
      const altGreetings: string[] = []

      fields.forEach((f) => {
        if (f.key === 'alternate_greetings') {
          altGreetings.push(f.value)
        } else {
          patch[f.key] = f.value
        }
      })

      if (enabledFields.has('alternate_greetings')) {
        patch.alternate_greetings = altGreetings
      }

      ctx.sendToBackend({
        type: 'save_character',
        characterId: selectedChar.id,
        name: selectedChar.name,
        patch,
      })
    } else if (currentSourceMode === 'lorebook' && selectedItemId) {
      const updates = fields.map((f) => ({ id: f.id, content: f.value }))
      ctx.sendToBackend({
        type: 'save_world_book_entries',
        worldBookId: selectedItemId,
        updates,
      })
    }
  }

  // ── Backend Message Handling ──
  const unsubMsg = ctx.onBackendMessage((payload: any) => {
    switch (payload.type) {
      case 'presets_loaded': {
        presets = payload.presets || []
        pipelineUI?.setPresets(presets)
        updateRunnerPresetDropdown()
        break
      }

      case 'characters_list': {
        characters = payload.characters || []
        updateSelectOptions()
        break
      }

      case 'world_books_list': {
        worldBooks = payload.worldBooks || []
        updateSelectOptions()
        break
      }

      case 'character_data': {
        selectedChar = payload.character
        buildCharacterFields()
        break
      }

      case 'world_book_data': {
        selectedWorldBookEntries = payload.entries || []
        buildWorldBookFields()
        break
      }

      case 'save_success': {
        if (payload.entityType === 'character' && selectedChar) {
          ctx.sendToBackend({ type: 'get_character', characterId: selectedChar.id })
        } else if (payload.entityType === 'world_book' && selectedItemId) {
          ctx.sendToBackend({ type: 'get_world_book', worldBookId: selectedItemId })
        }
        break
      }
    }
  })

  // Initial load
  updateRegexModeUI()
  ctx.sendToBackend({ type: 'load_presets' })
  fetchList()

  // ── Teardown ──
  return () => {
    if (typingTimer) clearTimeout(typingTimer)
    removeStyle()
    unsubMsg()
    selectComponent?.destroy()
    tab.destroy()
  }
}
