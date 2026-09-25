declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const PRESETS_STORAGE_FILE = 'regex_presets.json'

async function loadPresets(): Promise<any[]> {
  try {
    const data = await spindle.storage.getJson(PRESETS_STORAGE_FILE)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function savePresets(presets: any[]) {
  await spindle.storage.setJson(PRESETS_STORAGE_FILE, presets)
}

// Helpers for characters and world books pagination
async function fetchAllCharacters(userId?: string) {
  const all: Array<{ id: string; name: string; tags: string[] }> = []
  let offset = 0
  const limit = 200
  while (true) {
    const result = await spindle.characters.list({ limit, offset, userId } as any)
    const items = result.data || []
    for (const item of items) {
      all.push({
        id: item.id,
        name: item.name,
        tags: Array.isArray(item.tags) ? item.tags : [],
      })
    }
    if (items.length < limit || all.length >= (result.total || 0)) break
    offset += limit
  }
  return all
}

async function fetchAllWorldBooks(userId?: string) {
  const all: Array<{ id: string; name: string }> = []
  let offset = 0
  const limit = 200
  while (true) {
    const result = await spindle.world_books.list({ limit, offset, userId } as any)
    const items = result.data || []
    for (const item of items) all.push({ id: item.id, name: item.name })
    if (items.length < limit || all.length >= (result.total || 0)) break
    offset += limit
  }
  return all
}

spindle.onFrontendMessage(async (payload: any, userId?: string) => {
  try {
    switch (payload.type) {
      // ── Preset Library Actions ──
      case 'load_presets': {
        const presets = await loadPresets()
        spindle.sendToFrontend({ type: 'presets_loaded', presets }, userId)
        break
      }

      case 'save_preset': {
        const presets = await loadPresets()
        const existingIdx = presets.findIndex((p) => p.id === payload.preset.id)
        if (existingIdx >= 0) {
          presets[existingIdx] = payload.preset
        } else {
          presets.push(payload.preset)
        }
        await savePresets(presets)
        spindle.toast.success(`Preset "${payload.preset.name}" saved!`)
        spindle.sendToFrontend({ type: 'presets_loaded', presets }, userId)
        break
      }

      case 'delete_preset': {
        let presets = await loadPresets()
        presets = presets.filter((p) => p.id !== payload.presetId)
        await savePresets(presets)
        spindle.toast.info('Preset deleted.')
        spindle.sendToFrontend({ type: 'presets_loaded', presets }, userId)
        break
      }

      // ── Character Card Actions ──
      case 'list_characters': {
        const characters = await fetchAllCharacters(userId)
        spindle.sendToFrontend({ type: 'characters_list', characters }, userId)
        break
      }

      case 'get_character': {
        const char = await spindle.characters.get(payload.characterId, userId as any)
        spindle.sendToFrontend({ type: 'character_data', character: char }, userId)
        break
      }

      case 'get_batch_characters': {
        const charList: any[] = []
        for (const charId of payload.characterIds || []) {
          const char = await spindle.characters.get(charId, userId as any)
          if (char) charList.push(char)
        }
        spindle.sendToFrontend({ type: 'batch_characters_data', characters: charList }, userId)
        break
      }

      case 'save_character': {
        await spindle.characters.update(payload.characterId, payload.patch, userId as any)
        spindle.toast.success(`Character "${payload.name || 'card'}" updated!`)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'character' }, userId)
        break
      }

      case 'save_batch_characters': {
        const updates = payload.updates || []
        for (const u of updates) {
          await spindle.characters.update(u.id, u.patch, userId as any)
        }
        spindle.toast.success(`Batch updated ${updates.length} character cards!`)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'character_batch' }, userId)
        break
      }

      // ── Lorebook Actions ──
      case 'list_world_books': {
        const worldBooks = await fetchAllWorldBooks(userId)
        spindle.sendToFrontend({ type: 'world_books_list', worldBooks }, userId)
        break
      }

      case 'get_world_book': {
        const allEntries: any[] = []
        let offset = 0
        const limit = 200
        while (true) {
          const entriesResult = await spindle.world_books.entries.list(payload.worldBookId, { limit, offset, userId } as any)
          const items = entriesResult.data || []
          allEntries.push(...items)
          if (items.length < limit || allEntries.length >= (entriesResult.total || 0)) break
          offset += limit
        }
        spindle.sendToFrontend({ type: 'world_book_data', worldBookId: payload.worldBookId, entries: allEntries }, userId)
        break
      }

      case 'save_world_book_entries': {
        const { updates } = payload
        for (const update of updates) {
          await spindle.world_books.entries.update(update.id, { content: update.content }, userId as any)
        }
        spindle.toast.success(`Updated ${updates.length} lorebook entries!`)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'world_book' }, userId)
        break
      }
    }
  } catch (err: any) {
    spindle.log.error(`[regex-studio] Error: ${err.message}`)
    spindle.toast.error(err.message, { title: 'Operation Failed' })
    spindle.sendToFrontend({ type: 'error', message: err.message }, userId)
  }
})