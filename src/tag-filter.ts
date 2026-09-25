import type { SpindleFrontendContext, SpindleMultiSelectHandle } from 'lumiverse-spindle-types'

export interface CharacterItemWithTags {
  id: string
  name: string
  tags: string[]
}

export interface TagFilterState {
  includeTags: string[]
  excludeTags: string[]
}

export function extractUniqueTags(characters: CharacterItemWithTags[]): string[] {
  const tagSet = new Set<string>()
  characters.forEach((c) => {
    if (Array.isArray(c.tags)) {
      c.tags.forEach((t) => {
        const trimmed = t.trim()
        if (trimmed) tagSet.add(trimmed)
      })
    }
  })
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
}

/**
 * Filters characters based on include and exclude tags.
 * Exclusion takes strict precedence: if a card matches ANY excluded tag, it is omitted.
 */
export function filterCharactersByTags(
  characters: CharacterItemWithTags[],
  includeTags: string[],
  excludeTags: string[]
): CharacterItemWithTags[] {
  const incSet = new Set(includeTags)
  const excSet = new Set(excludeTags)

  return characters.filter((char) => {
    const charTags = new Set(char.tags || [])

    // 1. Exclusion check (Takes precedence)
    for (const tag of excSet) {
      if (charTags.has(tag)) return false
    }

    // 2. Inclusion check (If includeTags are specified, card must have at least one)
    if (incSet.size > 0) {
      let hasInclude = false
      for (const tag of incSet) {
        if (charTags.has(tag)) {
          hasInclude = true
          break
        }
      }
      if (!hasInclude) return false
    }

    return true
  })
}

export interface TagFilterMountResult {
  state: TagFilterState
  updateTagOptions: (tags: string[]) => void
  destroy: () => void
}

export function mountTagFilterControls(
  ctx: SpindleFrontendContext,
  container: HTMLElement,
  onFilterChange: (state: TagFilterState) => void
): TagFilterMountResult {
  const state: TagFilterState = {
    includeTags: [],
    excludeTags: [],
  }

  container.innerHTML = `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%;">
      <div id="rs-include-tags-slot" style="flex: 1; min-width: 140px;"></div>
      <div id="rs-exclude-tags-slot" style="flex: 1; min-width: 140px;"></div>
    </div>
  `

  const incSlot = container.querySelector('#rs-include-tags-slot') as HTMLElement
  const excSlot = container.querySelector('#rs-exclude-tags-slot') as HTMLElement

  const incSelect: SpindleMultiSelectHandle = ctx.components.mountMultiSelect(incSlot, {
    value: [],
    placeholder: 'Filter by Tag (Include)...',
    searchPlaceholder: 'Search tags to include...',
    searchThreshold: 1,
    options: [],
    onChange: (vals) => {
      state.includeTags = vals
      onFilterChange(state)
    },
  })

  const excSelect: SpindleMultiSelectHandle = ctx.components.mountMultiSelect(excSlot, {
    value: [],
    placeholder: 'Hide by Tag (Exclude)...',
    searchPlaceholder: 'Search tags to exclude...',
    searchThreshold: 1,
    options: [],
    onChange: (vals) => {
      state.excludeTags = vals
      onFilterChange(state)
    },
  })

  return {
    state,
    updateTagOptions: (tags: string[]) => {
      const opts = tags.map((t) => ({ value: t, label: t }))
      incSelect.update({ options: opts })
      excSelect.update({ options: opts })
    },
    destroy: () => {
      incSelect.destroy()
      excSelect.destroy()
    },
  }
}