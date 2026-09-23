import type { SpindleFrontendContext, SpindleSelectHandle } from 'lumiverse-spindle-types'

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

type Mode = 'character' | 'lorebook' | 'custom'

interface RegexMatch {
  index: number
  length: number
  text: string
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function setup(ctx: SpindleFrontendContext) {
  let currentMode: Mode = 'character'
  let characters: Array<{ id: string; name: string }> = []
  let worldBooks: Array<{ id: string; name: string }> = []
  let selectedChar: any = null
  let selectedWorldBookEntries: any[] = []
  let selectedItemId = ''
  let selectComponent: SpindleSelectHandle | null = null

  const enabledFields = new Set<string>([
    'first_mes',
    'alternate_greetings',
    'description',
    'personality',
    'scenario',
  ])

  // ── Regex, Plain-Text & Navigation State ──
  let useRegex = true
  const flags = { g: true, i: false, m: true, s: true }
  let currentMatches: RegexMatch[] = []
  let currentMatchIndex = -1

  // ── Undo / Redo History Stack ──
  let historyStack: string[] = ['']
  let historyIndex = 0
  const MAX_HISTORY = 100
  let typingTimer: ReturnType<typeof setTimeout> | null = null

  // ── Register Drawer Tab ──
  const tab = ctx.ui.registerDrawerTab({
    id: 'regex_studio',
    title: 'Regex Studio',
    shortName: 'Rgx Studio',
    description: 'Plain-text and regex editor for cards, lorebooks, and custom text',
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
    .rs-textarea { width: 100%; min-height: 270px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.45; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 10px; resize: vertical; box-sizing: border-box; }
    .rs-textarea::selection { background: var(--rs-highlight-color, rgba(109, 93, 252, 0.45)); color: inherit; }
    .rs-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: 12px; cursor: pointer; user-select: none; font-weight: 500; }
    .rs-chip.active { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border-color: var(--lumiverse-accent); }
    .rs-chip.disabled { opacity: 0.4; cursor: not-allowed; }
    .rs-card { background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .rs-color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--lumiverse-border); cursor: pointer; padding: 0; background: none; -webkit-appearance: none; appearance: none; }
    .rs-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
    .rs-color-swatch::-webkit-color-swatch { border: none; border-radius: 50%; }
  `)

  // ── Render HTML Shell ──
  tab.root.innerHTML = `
    <div class="rs-container">
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

      <!-- Field Filter Chips (Characters) -->
      <div id="rs-fields-filter" class="rs-card">
        <div style="font-weight: 500; font-size: 11.5px;">Include Fields in Plain Text:</div>
        <div class="rs-row" id="rs-chips-container"></div>
      </div>

      <!-- Regex Find & Replace Toolbar -->
      <div class="rs-card">
        <div class="rs-row">
          <input type="text" id="rs-regex-find" class="rs-input" placeholder="Find text..." style="flex: 1; min-width: 140px;" />
          <input type="text" id="rs-regex-replace" class="rs-input" placeholder="Replace with..." style="flex: 1; min-width: 140px;" />
        </div>
        <div class="rs-row" style="justify-content: space-between;">
          <div class="rs-row">
            <label class="rs-chip active" id="rs-toggle-regex" title="Toggle Regular Expressions">.* Regex</label>
            <span style="font-size: 11px; color: var(--lumiverse-text-dim); margin-left: 2px;">Flags:</span>
            <label class="rs-chip active" id="rs-flag-g" title="Global match">g</label>
            <label class="rs-chip" id="rs-flag-i" title="Case insensitive">i</label>
            <label class="rs-chip active" id="rs-flag-m" title="Multiline">m</label>
            <label class="rs-chip active" id="rs-flag-s" title="Dot matches newline">s</label>
            <span style="font-size: 11px; color: var(--lumiverse-text-dim); margin-left: 4px;">Highlight:</span>
            <input type="color" id="rs-color-picker" class="rs-color-swatch" value="#6d5dfc" title="Change match highlight color" />
          </div>
          <div class="rs-row">
            <span id="rs-match-count" style="font-size: 11px; color: var(--lumiverse-text-dim);">No matches</span>
            <button class="rs-btn" id="rs-prev-match-btn" title="Previous Match (Shift+Enter in Find)" disabled>◀</button>
            <button class="rs-btn" id="rs-next-match-btn" title="Next Match (Enter in Find)" disabled>▶</button>
            <button class="rs-btn" id="rs-replace-one-btn" title="Replace Current Match" disabled>Replace</button>
            <button class="rs-btn rs-btn-primary" id="rs-replace-all-btn">Replace All</button>
          </div>
        </div>
      </div>

      <!-- Plain Text Editor -->
      <textarea id="rs-text-editor" class="rs-textarea" placeholder="Selected character/lorebook text will be converted here. You can also paste your own text."></textarea>

      <!-- Footer Actions -->
      <div class="rs-row" style="justify-content: space-between;">
        <div class="rs-row">
          <button class="rs-btn" id="rs-undo-btn" title="Undo change" disabled>↶ Undo</button>
          <button class="rs-btn" id="rs-redo-btn" title="Redo change" disabled>↷ Redo</button>
        </div>
        <div class="rs-row">
          <button class="rs-btn" id="rs-copy-btn">Copy Text</button>
          <button class="rs-btn" id="rs-reset-btn">Reset All</button>
          <button class="rs-btn rs-btn-primary" id="rs-save-btn">Save Changes</button>
        </div>
      </div>
    </div>
  `

  // ── Elements ──
  const modeCharBtn = tab.root.querySelector('#rs-mode-char') as HTMLButtonElement
  const modeLoreBtn = tab.root.querySelector('#rs-mode-lore') as HTMLButtonElement
  const modeCustomBtn = tab.root.querySelector('#rs-mode-custom') as HTMLButtonElement
  const selectorSection = tab.root.querySelector('#rs-selector-section') as HTMLElement
  const selectSlot = tab.root.querySelector('#rs-select-slot') as HTMLElement
  const refreshBtn = tab.root.querySelector('#rs-refresh-btn') as HTMLButtonElement
  const fieldsFilterCard = tab.root.querySelector('#rs-fields-filter') as HTMLElement
  const chipsContainer = tab.root.querySelector('#rs-chips-container') as HTMLElement
  const regexFindInput = tab.root.querySelector('#rs-regex-find') as HTMLInputElement
  const regexReplaceInput = tab.root.querySelector('#rs-regex-replace') as HTMLInputElement
  const regexToggleBtn = tab.root.querySelector('#rs-toggle-regex') as HTMLElement
  const flagGEl = tab.root.querySelector('#rs-flag-g') as HTMLElement
  const flagMEl = tab.root.querySelector('#rs-flag-m') as HTMLElement
  const flagSEl = tab.root.querySelector('#rs-flag-s') as HTMLElement
  const colorPicker = tab.root.querySelector('#rs-color-picker') as HTMLInputElement
  const matchCountSpan = tab.root.querySelector('#rs-match-count') as HTMLElement
  const prevMatchBtn = tab.root.querySelector('#rs-prev-match-btn') as HTMLButtonElement
  const nextMatchBtn = tab.root.querySelector('#rs-next-match-btn') as HTMLButtonElement
  const replaceOneBtn = tab.root.querySelector('#rs-replace-one-btn') as HTMLButtonElement
  const replaceAllBtn = tab.root.querySelector('#rs-replace-all-btn') as HTMLButtonElement
  const textEditor = tab.root.querySelector('#rs-text-editor') as HTMLTextAreaElement
  const undoBtn = tab.root.querySelector('#rs-undo-btn') as HTMLButtonElement
  const redoBtn = tab.root.querySelector('#rs-redo-btn') as HTMLButtonElement
  const copyBtn = tab.root.querySelector('#rs-copy-btn') as HTMLButtonElement
  const resetBtn = tab.root.querySelector('#rs-reset-btn') as HTMLButtonElement
  const saveBtn = tab.root.querySelector('#rs-save-btn') as HTMLButtonElement

  // ── Undo / Redo Stack Operations ──
  function pushHistory(newVal: string) {
    if (historyStack[historyIndex] === newVal) return
    historyStack = historyStack.slice(0, historyIndex + 1)
    historyStack.push(newVal)
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
      textEditor.value = historyStack[historyIndex]
      updateHistoryButtons()
      scanMatches({ shouldFocus: false })
    }
  }

  function redo() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++
      textEditor.value = historyStack[historyIndex]
      updateHistoryButtons()
      scanMatches({ shouldFocus: false })
    }
  }

  function resetHistory(initialText: string) {
    historyStack = [initialText]
    historyIndex = 0
    updateHistoryButtons()
  }

  // ── Highlight Color Customization ──
  function setHighlightColor(hexColor: string) {
    tab.root.style.setProperty('--rs-highlight-color', `${hexColor}77`)
  }

  colorPicker.oninput = () => setHighlightColor(colorPicker.value)
  setHighlightColor(colorPicker.value)

  // ── Mount Native Searchable Select ──
  selectComponent = ctx.components.mountSelect(selectSlot, {
    value: '',
    placeholder: 'Search and choose a Character...',
    searchPlaceholder: 'Search by name...',
    searchThreshold: 1,
    options: [],
    onChange: (id) => {
      selectedItemId = id
      if (!id) return
      if (currentMode === 'character') {
        ctx.sendToBackend({ type: 'get_character', characterId: id })
      } else if (currentMode === 'lorebook') {
        ctx.sendToBackend({ type: 'get_world_book', worldBookId: id })
      }
    },
  })

  // ── Populate Field Filter Chips ──
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
      if (selectedChar) renderCharacterToText()
    }
    chipsContainer.appendChild(chip)
  })

  // ── Regex Toggle & Flags ──
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

  // ── Conversion: Characters <-> Plain Text ──
  function renderCharacterToText() {
    if (!selectedChar) return
    const sections: string[] = []

    for (const f of CHAR_FIELDS) {
      if (!enabledFields.has(f.key)) continue

      if (f.key === 'alternate_greetings') {
        const altGreetings: string[] = Array.isArray(selectedChar.alternate_greetings)
          ? selectedChar.alternate_greetings
          : []
        altGreetings.forEach((greeting, idx) => {
          sections.push(`=== [Alternate Greeting ${idx + 1}] ===\n${greeting.trim()}`)
        })
      } else {
        const val = (selectedChar[f.key] || '').trim()
        sections.push(`=== [${f.label}] ===\n${val}`)
      }
    }

    const text = sections.join('\n\n')
    textEditor.value = text
    resetHistory(text)
    scanMatches({ shouldFocus: false })
  }

  function parseTextToCharacterPatch(): Record<string, any> {
    const text = textEditor.value
    const patch: Record<string, any> = {}
    const altGreetings: string[] = []

    const regexHeader = /===\s*\[([^\]]+)\]\s*===/g
    const matches = [...text.matchAll(regexHeader)]

    for (let i = 0; i < matches.length; i++) {
      const headerTitle = matches[i][1].trim()
      const startIndex = matches[i].index! + matches[i][0].length
      const endIndex = i + 1 < matches.length ? matches[i + 1].index! : text.length
      const content = text.slice(startIndex, endIndex).trim()

      if (headerTitle.startsWith('Alternate Greeting')) {
        altGreetings.push(content)
      } else {
        const field = CHAR_FIELDS.find((f) => f.label.toLowerCase() === headerTitle.toLowerCase())
        if (field) {
          patch[field.key] = content
        }
      }
    }

    if (enabledFields.has('alternate_greetings')) {
      patch.alternate_greetings = altGreetings
    }

    return patch
  }

  // ── Conversion: Lorebooks <-> Plain Text ──
  function renderWorldBookToText() {
    const sections = selectedWorldBookEntries.map((entry, idx) => {
      const name = entry.comment || `Entry ${idx + 1}`
      return `=== [Entry: ${name} (ID: ${entry.id})] ===\n${(entry.content || '').trim()}`
    })
    const text = sections.join('\n\n')
    textEditor.value = text
    resetHistory(text)
    scanMatches({ shouldFocus: false })
  }

  function parseTextToWorldBookUpdates(): Array<{ id: string; content: string }> {
    const text = textEditor.value
    const updates: Array<{ id: string; content: string }> = []
    const headerRegex = /===\s*\[Entry:\s*(.*?)\s*\(ID:\s*([a-zA-Z0-9_-]+)\)\]\s*===/g
    const matches = [...text.matchAll(headerRegex)]

    for (let i = 0; i < matches.length; i++) {
      const entryId = matches[i][2].trim()
      const startIndex = matches[i].index! + matches[i][0].length
      const endIndex = i + 1 < matches.length ? matches[i + 1].index! : text.length
      const content = text.slice(startIndex, endIndex).trim()
      updates.push({ id: entryId, content })
    }

    return updates
  }

  // ── Match Scan, Stepping & Single Replace ──
  function getActiveRegExp(): RegExp | null {
    const pattern = regexFindInput.value
    if (!pattern) return null
    try {
      if (!useRegex) {
        // Plain text search (escaped regex with global and optional case-insensitivity)
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
    const rx = getActiveRegExp()
    const text = textEditor.value
    currentMatches = []

    if (!rx || !text) {
      currentMatchIndex = -1
      updateMatchUI(opts.shouldFocus ?? false)
      return
    }

    let match: RegExpExecArray | null
    const execRx = rx.global ? rx : new RegExp(rx.source, rx.flags + 'g')

    while ((match = execRx.exec(text)) !== null) {
      currentMatches.push({
        index: match.index,
        length: match[0].length,
        text: match[0],
      })
      if (match.index === execRx.lastIndex) {
        execRx.lastIndex++
      }
    }

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
    textEditor.focus()
    textEditor.setSelectionRange(match.index, match.index + match.length)
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
    const rx = getActiveRegExp()
    if (!rx) return

    const replacePattern = regexReplaceInput.value
    const text = textEditor.value
    const matchedSubstring = text.slice(match.index, match.index + match.length)

    const replaced = useRegex
      ? matchedSubstring.replace(rx, replacePattern)
      : replacePattern // plain text literal replacement

    const updatedText = text.slice(0, match.index) + replaced + text.slice(match.index + match.length)
    textEditor.value = updatedText
    pushHistory(updatedText)

    scanMatches({ shouldFocus: true, preserveIndex: true })
  }

  // ── Mode Switching & Dropdown Updates ──
  function setMode(mode: Mode) {
    currentMode = mode
    modeCharBtn.className = `rs-btn ${mode === 'character' ? 'rs-btn-primary' : ''}`
    modeLoreBtn.className = `rs-btn ${mode === 'lorebook' ? 'rs-btn-primary' : ''}`
    modeCustomBtn.className = `rs-btn ${mode === 'custom' ? 'rs-btn-primary' : ''}`

    if (mode === 'custom') {
      selectorSection.style.display = 'none'
      fieldsFilterCard.style.display = 'none'
      saveBtn.style.display = 'none'
      resetHistory(textEditor.value)
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
    if (currentMode === 'character') {
      selectComponent.update({
        value: selectedItemId,
        placeholder: `Choose from ${characters.length} characters...`,
        searchPlaceholder: 'Search character name...',
        options: characters.map((c) => ({ value: c.id, label: c.name })),
      })
    } else if (currentMode === 'lorebook') {
      selectComponent.update({
        value: selectedItemId,
        placeholder: `Choose from ${worldBooks.length} lorebooks...`,
        searchPlaceholder: 'Search lorebook name...',
        options: worldBooks.map((b) => ({ value: b.id, label: b.name })),
      })
    }
  }

  function fetchList() {
    if (currentMode === 'character') {
      ctx.sendToBackend({ type: 'list_characters' })
    } else if (currentMode === 'lorebook') {
      ctx.sendToBackend({ type: 'list_world_books' })
    }
  }

  // ── Event Handlers ──
  modeCharBtn.onclick = () => setMode('character')
  modeLoreBtn.onclick = () => setMode('lorebook')
  modeCustomBtn.onclick = () => setMode('custom')
  refreshBtn.onclick = () => fetchList()

  regexFindInput.oninput = () => scanMatches({ shouldFocus: false })

  regexFindInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prevMatch()
      else nextMatch()
    }
  }

  textEditor.oninput = () => {
    scanMatches({ shouldFocus: false })
    if (typingTimer) clearTimeout(typingTimer)
    typingTimer = setTimeout(() => {
      pushHistory(textEditor.value)
    }, 600)
  }

  undoBtn.onclick = () => undo()
  redoBtn.onclick = () => redo()

  nextMatchBtn.onclick = () => nextMatch()
  prevMatchBtn.onclick = () => prevMatch()
  replaceOneBtn.onclick = () => replaceSingleMatch()

  replaceAllBtn.onclick = () => {
    const rx = getActiveRegExp()
    if (!rx) return
    const replaceStr = regexReplaceInput.value
    const updatedText = useRegex
      ? textEditor.value.replace(rx, replaceStr)
      : textEditor.value.replace(rx, () => replaceStr) // literal plain text replace

    textEditor.value = updatedText
    pushHistory(updatedText)
    scanMatches({ shouldFocus: false })
  }

  resetBtn.onclick = () => {
    if (currentMode === 'character' && selectedChar) renderCharacterToText()
    else if (currentMode === 'lorebook') renderWorldBookToText()
    else {
      textEditor.value = ''
      resetHistory('')
    }
  }

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(textEditor.value)
  }

  saveBtn.onclick = () => {
    if (currentMode === 'character' && selectedChar) {
      const patch = parseTextToCharacterPatch()
      ctx.sendToBackend({
        type: 'save_character',
        characterId: selectedChar.id,
        name: selectedChar.name,
        patch,
      })
    } else if (currentMode === 'lorebook' && selectedItemId) {
      const updates = parseTextToWorldBookUpdates()
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
        renderCharacterToText()
        break
      }

      case 'world_book_data': {
        selectedWorldBookEntries = payload.entries || []
        renderWorldBookToText()
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
