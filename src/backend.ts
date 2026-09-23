declare const spindle: import('lumiverse-spindle-types').SpindleAPI

spindle.onFrontendMessage(async (payload: any, userId?: string) => {
  try {
    switch (payload.type) {
      // ── Character Card Actions ──
      case 'list_characters': {
        const result = await spindle.characters.list({ limit: 200, offset: 0, userId } as any)
        spindle.sendToFrontend({
          type: 'characters_list',
          characters: (result.data || []).map((c) => ({ id: c.id, name: c.name })),
        }, userId)
        break
      }

      case 'get_character': {
        const char = await spindle.characters.get(payload.characterId, { userId } as any)
        spindle.sendToFrontend({
          type: 'character_data',
          character: char,
        }, userId)
        break
      }

      case 'save_character': {
        await spindle.characters.update(payload.characterId, payload.patch, { userId } as any)
        spindle.toast.success(`Character "${payload.name || 'card'}" updated successfully!`, { userId } as any)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'character' }, userId)
        break
      }

      // ── Lorebook Actions ──
      case 'list_world_books': {
        const result = await spindle.world_books.list({ limit: 200, offset: 0, userId } as any)
        spindle.sendToFrontend({
          type: 'world_books_list',
          worldBooks: (result.data || []).map((b) => ({ id: b.id, name: b.name })),
        }, userId)
        break
      }

      case 'get_world_book': {
        const entriesResult = await spindle.world_books.entries.list(
          payload.worldBookId,
          { limit: 200, offset: 0, userId } as any
        )
        spindle.sendToFrontend({
          type: 'world_book_data',
          worldBookId: payload.worldBookId,
          entries: entriesResult.data || [],
        }, userId)
        break
      }

      case 'save_world_book_entries': {
        const { updates } = payload
        for (const update of updates) {
          await spindle.world_books.entries.update(
            update.id,
            { content: update.content },
            { userId } as any
          )
        }
        spindle.toast.success(`Updated ${updates.length} lorebook entries!`, { userId } as any)
        spindle.sendToFrontend({ type: 'save_success', entityType: 'world_book' }, userId)
        break
      }
    }
  } catch (err: any) {
    spindle.log.error(`[regex-studio] Error handling ${payload.type}: ${err.message}`)
    spindle.toast.error(err.message, { title: 'Operation Failed', userId } as any)
    spindle.sendToFrontend({ type: 'error', message: err.message }, userId)
  }
})
