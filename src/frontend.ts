import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

// Supported Character Fields
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

export function setup(ctx: SpindleFrontendContext) {
  // ── State ──
  let currentMode: Mode = 'character'
  let characters: Array<{ id: string; name: string }> = []
  let worldBooks: Array<{ id: string; name: string }> = []
  let selectedChar: any = null
  let selectedWorldBookEntries: any[] = []
  let enabledFields = new Set<string>(['first_mes', 'alternate_greetings', 'description', 'personality', 'scenario'])

  // Regex Flags
  const flags = { g: true, i: false, m: true, s: true }

  // ── Tab Registration ──
  const tab = ctx.ui.registerDrawerTab({
    id: 'regex_studio',
    title: 'Regex Studio',
    shortName: 'Regex',
    description: 'Convert and Regex edit cards, lorebooks, and custom text',
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
  })

  // ── Inject CSS Styles ──
  const removeStyle = ctx.dom.addStyle(`
    .rs-container { display: flex; flex-direction: column; gap: 10px; padding: 12px; font-size: 13px; color: var(--lumiverse-text); }
    .rs-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .rs-header-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
    .rs-select, .rs-input { background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 6px 10px; font-size: 12px; outline: none; }
    .rs-select:focus, .rs-input:focus { border-color: var(--lumiverse-accent); }
    .rs-btn { background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 6px 12px; font-size: 12px; cursor: pointer; transition: background 0.15s; font-weight: 500; }
    .rs-btn:hover { background: var(--lumiverse-border); }
    .rs-btn-primary { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border: 1px solid var(--lumiverse-accent); }
    .rs-btn-primary:hover { opacity: 0.9; }
    .rs-textarea { width: 100%; min-height: 260px; font-family: monospace; font-size: 12px; line-height: 1.45; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 10px; resize: vertical; box-sizing: border-box; }
    .rs-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: 12px; cursor: pointer; user-select: none; }
    .rs-chip.active { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border-color: var(--lumiverse-accent); }
    .rs-card { background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  `)

  // ── Render Shell ──
  tab.root.innerHTML = `
    <div class="rs-container">
      <div class="rs-row">
        <label class="rs-header-title">Source Mode:</label>
        <button class="rs-btn rs-btn-primary" id="rs-mode-char">Character Card</button>
        <button class="rs-btn" id="rs-mode-lore">Lorebook</button>
        <button class="rs-btn" id="rs-mode-custom">Custom Text</button>
      </div>

      <!-- Selector Section -->
      <div id="rs-selector-section" class="rs-row">
        <select id="rs-item-select" class="rs-select" style="flex: 1;">
          <option value="">-- Choose Character --</option>
        </select>
        <button class="rs-btn" id="rs-refresh-btn">Refresh</button>
      </div>

      <!-- Field Filter Chips (Characters) -->
      <div id="rs-fields-filter" class="rs-card">
        <div style="font-weight: 500; font-size: 11.5px;">Include Fields in Plain Text:</div>
        <div class="rs-row" id="rs-chips-container"></div>
      </div>

      <!-- Regex Controls -->
      <div class="rs-card">
        <div class="rs-row">
          <input type="text" id="rs-regex-find" class="rs-input" placeholder="Find Regex (e.g. \\*[\\s\\S]*?\\*)" style="flex: 2;" />
          <input type="text" id="rs-regex-replace" class="rs-input" placeholder="Replace With (e.g. $1 or empty)" style="flex: 2;" />
        </div>
        <div class="rs-row" style="justify-content: space-between;">
          <div class="rs-row">
            <span style="font-size: 11px; color: var(--lumiverse-text-dim);">Flags:</span>
            <label class="rs-chip active" id="rs-flag-g">g</label>
            <label class="rs-chip" id="rs-flag-i">i</label>
            <label class="rs-chip active" id="rs-flag-m">m</label>
            <label class="rs-chip active" id="rs-flag-s">s</label>
          </div>
          <div class="rs-row">
            <span id="rs-match-count" style="font-size: 11px; color: var(--lumiverse-text-dim);">0 matches</span>
            <button class="rs-btn rs-btn-primary" id="rs-apply-regex-btn">Replace All</button>
          </div>
        </div>
      </div>

      <!-- Plain Text Editor -->
      <textarea id="rs-text-editor" class="rs-textarea" placeholder="Selected character/lorebook text will be converted here. You can also paste arbitrary text."></textarea>

      <!-- Action Footer -->
      <div class="rs-row" style="justify-content: flex-end;">
        <button class="rs-btn" id="rs-copy-btn">Copy Text</button>
        <button class="rs-btn" id="rs-reset-btn">Reset</button>
        <button class="rs-btn rs-btn-primary" id="rs-save-btn">Save to Card / Lorebook</button>
      </div>
    </div>
  `

  // ── Elements ──
  const modeCharBtn = tab.root.querySelector('#rs-mode-char') as HTMLButtonElement
  const modeLoreBtn = tab.root.querySelector('#rs-mode-lore') as HTMLButtonElement
  const modeCustomBtn = tab.root.querySelector('#rs-mode-custom') as HTMLButtonElement
  const selectorSection = tab.root.querySelector('#rs-selector-section') as HTMLElement
  const itemSelect = tab.root.querySelector('#rs-item-select') as HTMLSelectElement
  const refreshBtn = tab.root.querySelector('#rs-refresh-btn') as HTMLButtonElement
  const fieldsFilterCard = tab.root.querySelector('#rs-fields-filter') as HTMLElement
  const chipsContainer = tab.root.querySelector('#rs-chips-container') as HTMLElement
  const regexFindInput = tab.root.querySelector('#rs-regex-find') as HTMLInputElement
  const regexReplaceInput = tab.root.querySelector('#rs-regex-replace') as HTMLInputElement
  const matchCountSpan = tab.root.querySelector('#rs-match-count') as HTMLElement
  const applyRegexBtn = tab.root.querySelector('#rs-apply-regex-btn') as HTMLButtonElement
  const textEditor = tab.root.querySelector('#rs-text-editor') as HTMLTextAreaElement
  const copyBtn = tab.root.querySelector('#rs-copy-btn') as HTMLButtonElement
  const resetBtn = tab.root.querySelector('#rs-reset-btn') as HTMLButtonElement
  const saveBtn = tab.root.querySelector('#rs-save-btn') as HTMLButtonElement

  // ── Build Field Filter Chips ──
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

  // ── Wire Flags ──
  ;(['g', 'i', 'm', 's'] as const).forEach((f) => {
    const el = tab.root.querySelector(`#rs-flag-${f}`) as HTMLElement
    el.onclick = () => {
      flags[f] = !flags[f]
      el.classList.toggle('active', flags[f])
      updateMatchCount()
    }
  })

  // ── Formatting Helpers: JSON <-> Plain Text ──
  function renderCharacterToText() {
    if (!selectedChar) return
    const sections: string[] = []

    for (const f of CHAR_FIELDS) {
      if (!enabledFields.has(f.key)) continue

      if (f.key === 'alternate_greetings') {
        const altGreetings: string[] = Array.isArray(selectedChar.alternate_greetings) ? selectedChar.alternate_greetings : []
        altGreetings.forEach((greeting, idx) => {
          sections.push(`=== [Alternate Greeting ${idx + 1}] ===\n${greeting.trim()}`)
        })
      } else {
        const val = (selectedChar[f.key] || '').trim()
        sections.push(`=== [${f.label}] ===\n${val}`)
      }
    }

    textEditor.value = sections.join('\n\n')
    updateMatchCount()
  }

  function parseTextToCharacterPatch(): Record<string, any> {
    const text = textEditor.value
    const patch: Record<string, any> = {}
    const altGreetings: string[] = []

    // Split by sentinel headers: === [Header] ===
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

  function renderWorldBookToText() {
    const sections = selectedWorldBookEntries.map((entry, idx) => {
      const name = entry.comment || `Entry ${idx + 1}`
      return `=== [Entry: ${name} (ID: ${entry.id})] ===\n${(entry.content || '').trim()}`
    })
    textEditor.value = sections.join('\n\n')
    updateMatchCount()
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

  // ── Regex Helpers ──
  function getActiveRegExp(): RegExp | null {
    const pattern = regexFindInput.value
    if (!pattern) return null
    try {
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

  function updateMatchCount() {
    const rx = getActiveRegExp()
    if (!rx) {
      matchCountSpan.textContent = '0 matches'
      return
    }
    const matches = textEditor.value.match(rx)
    const count = matches ? matches.length : 0
    matchCountSpan.textContent = `${count} match${count === 1 ? '' : 'es'}`
  }

  // ── Mode Switching ──
  function setMode(mode: Mode) {
    currentMode = mode
    modeCharBtn.className = `rs-btn ${mode === 'character' ? 'rs-btn-primary' : ''}`
    modeLoreBtn.className = `rs-btn ${mode === 'lorebook' ? 'rs-btn-primary' : ''}`
    modeCustomBtn.className = `rs-btn ${mode === 'custom' ? 'rs-btn-primary' : ''}`

    if (mode === 'custom') {
      selectorSection.style.display = 'none'
      fieldsFilterCard.style.display = 'none'
      saveBtn.style.display = 'none'
    } else {
      selectorSection.style.display = 'flex'
      saveBtn.style.display = 'inline-block'
      fieldsFilterCard.style.display = mode === 'character' ? 'flex' : 'none'
      itemSelect.innerHTML = `<option value="">-- Choose ${mode === 'character' ? 'Character' : 'Lorebook'} --</option>`
      fetchList()
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

  itemSelect.onchange = () => {
    const id = itemSelect.value
    if (!id) return
    if (currentMode === 'character') {
      ctx.sendToBackend({ type: 'get_character', characterId: id })
    } else if (currentMode === 'lorebook') {
      ctx.sendToBackend({ type: 'get_world_book', worldBookId: id })
    }
  }

  regexFindInput.oninput = () => updateMatchCount()
  textEditor.oninput = () => updateMatchCount()

  applyRegexBtn.onclick = () => {
    const rx = getActiveRegExp()
    if (!rx) return
    const replaceStr = regexReplaceInput.value
    textEditor.value = textEditor.value.replace(rx, replaceStr)
    updateMatchCount()
  }

  resetBtn.onclick = () => {
    if (currentMode === 'character' && selectedChar) renderCharacterToText()
    else if (currentMode === 'lorebook') renderWorldBookToText()
    else textEditor.value = ''
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
    } else if (currentMode === 'lorebook' && itemSelect.value) {
      const updates = parseTextToWorldBookUpdates()
      ctx.sendToBackend({
        type: 'save_world_book_entries',
        worldBookId: itemSelect.value,
        updates,
      })
    }
  }

  // ── Backend Message Handling ──
  const unsubMsg = ctx.onBackendMessage((payload: any) => {
    switch (payload.type) {
      case 'characters_list': {
        characters = payload.characters || []
        itemSelect.innerHTML = `<option value="">-- Choose Character (${characters.length}) --</option>`
        characters.forEach((c) => {
          const opt = document.createElement('option')
          opt.value = c.id
          opt.textContent = c.name
          itemSelect.appendChild(opt)
        })
        break
      }

      case 'world_books_list': {
        worldBooks = payload.worldBooks || []
        itemSelect.innerHTML = `<option value="">-- Choose Lorebook (${worldBooks.length}) --</option>`
        worldBooks.forEach((b) => {
          const opt = document.createElement('option')
          opt.value = b.id
          opt.textContent = b.name
          itemSelect.appendChild(opt)
        })
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
        } else if (payload.entityType === 'world_book' && itemSelect.value) {
          ctx.sendToBackend({ type: 'get_world_book', worldBookId: itemSelect.value })
        }
        break
      }
    }
  })

  // Initial fetch on setup
  fetchList()

  // ── Teardown ──
  return () => {
    removeStyle()
    unsubMsg()
    tab.destroy()
  }
}
