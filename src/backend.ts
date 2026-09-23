declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// Helper to fetch all pages of characters
async function fetchAllCharacters(userId?: string) {
  const all: Array<{ id: string; name: string }> = []
  let offset = 0
  const limit = 200

  while (true) {
    const result = await spindle.characters.list({ limit, offset, userId } as any)
    const items = result.data || []
    for (const item of items) {
      all.push({ id: item.id, name: item.name })
    }
    if (items.length < limit || all.length >= (result.total || 0)) {
      break
    }
    offset += limit
  }
  return all
}

// Helper to fetch all pages of world books
async function fetchAllWorldBooks(userId?: string) {
  const all: Array<{ id: string; name: string }> = []
  let offset = 0
  const limit = 200

  while (true) {
    const result = await spindle.world_books.list({ limit, offset, userId } as any)
    const items = result.data || []
    for (const item of items) {
      all.push({ id: item.id, name: item.name })
    }
    if (items.length < limit || all.length >= (result.total || 0)) {
      break
    }
    offset += limit
  }
  return all
}

spindle.onFrontendMessage(async (payload: any, userId?: string) => {
  try {
    switch (payload.type) {
      // ── Character Card Actions ──
      case 'list_characters': {
        const characters = await fetchAllCharacters(userId)
        spindle.sendToFrontend({
          type: 'characters_list',
          characters,
        }, userId)
        break
      }

      case 'get_character': {
        const char = await spindle.characters.get(payload.characterId, userId as any)
        spindle.sendToFrontend({
          type: 'character_data',
          character: char,
        }, userId)
        break
      }

      case 'save_character': {
        await spindle.characters.update(payload.characterId, payload.patch, userId as any)
        spindle.toast.success(`Character "${payload.name || 'card'}" updated!`)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'character' }, userId)
        break
      }

      // ── Lorebook Actions ──
      case 'list_world_books': {
        const worldBooks = await fetchAllWorldBooks(userId)
        spindle.sendToFrontend({
          type: 'world_books_list',
          worldBooks,
        }, userId)
        break
      }

      case 'get_world_book': {
        // Fetch all entries for this lorebook
        const allEntries: any[] = []
        let offset = 0
        const limit = 200
        while (true) {
          const entriesResult = await spindle.world_books.entries.list(
            payload.worldBookId,
            { limit, offset, userId } as any
          )
          const items = entriesResult.data || []
          allEntries.push(...items)
          if (items.length < limit || allEntries.length >= (entriesResult.total || 0)) {
            break
          }
          offset += limit
        }

        spindle.sendToFrontend({
          type: 'world_book_data',
          worldBookId: payload.worldBookId,
          entries: allEntries,
        }, userId)
        break
      }

      case 'save_world_book_entries': {
        const { updates } = payload
        for (const update of updates) {
          await spindle.world_books.entries.update(
            update.id,
            { content: update.content },
            userId as any
          )
        }
        spindle.toast.success(`Updated ${updates.length} lorebook entries!`)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'world_book' }, userId)
        break
      }
    }
  } catch (err: any) {
    spindle.log.error(`[regex-studio] Error handling ${payload.type}: ${err.message}`)
    spindle.toast.error(err.message, { title: 'Operation Failed' })
    spindle.sendToFrontend({ type: 'error', message: err.message }, userId)
  }
})
