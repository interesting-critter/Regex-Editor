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

    // 1. Exclusion check (Takes strict precedence)
    for (const tag of excSet) {
      if (charTags.has(tag)) return false
    }

    // 2. Inclusion check (If includeTags specified, must have at least one)
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
  updateTagOptions: (data: any) => void
  destroy: () => void
}

/**
 * Builds tag options by:
 * 1. Pinning currently selected tags to the top.
 * 2. Showing only tags present on the currently filtered cards.
 * 3. Sorting unselected tags in alphabetical order.
 */
function buildContextualTagOptions(
  allCharacters: CharacterItemWithTags[],
  includeTags: string[],
  excludeTags: string[],
  selectedTagsForThisSelect: string[]
): Array<{ value: string; label: string }> {
  // If no include filters are active, pool is all non-excluded cards
  const matchingCards = filterCharactersByTags(allCharacters, includeTags, excludeTags)
  const availableTagsSet = new Set(extractUniqueTags(matchingCards))

  const selectedSet = new Set(selectedTagsForThisSelect)
  
  // 1. Pinned selected items (always keep selected visible even if other filters change)
  const pinnedSelected = Array.from(selectedSet)

  // 2. Unselected tags that exist on the matching cards
  const unselectedAvailable = Array.from(availableTagsSet)
    .filter((t) => !selectedSet.has(t))
    .sort((a, b) => a.localeCompare(b))

  return [...pinnedSelected, ...unselectedAvailable].map((t) => ({ value: t, label: t }))
}

export function mountTagFilterControls(
  ctx: SpindleFrontendContext,
  container: HTMLElement,
  onFilterChange: (state: TagFilterState) => void
): TagFilterMountResult {
  let allCharactersList: CharacterItemWithTags[] = []

  const state: TagFilterState = {
    includeTags: [],
    excludeTags: [],
  }

  container.replaceChildren()

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%;'

  const incSlot = document.createElement('div')
  incSlot.style.cssText = 'flex: 1; min-width: 140px;'

  const excSlot = document.createElement('div')
  excSlot.style.cssText = 'flex: 1; min-width: 140px;'

  wrap.append(incSlot, excSlot)
  container.appendChild(wrap)

  function refreshDropdownOptions() {
    incSelect.update({
      options: buildContextualTagOptions(
        allCharactersList,
        state.includeTags,
        state.excludeTags,
        state.includeTags
      ),
    })

    excSelect.update({
      options: buildContextualTagOptions(
        allCharactersList,
        state.includeTags,
        state.excludeTags,
        state.excludeTags
      ),
    })
  }

  const incSelect: SpindleMultiSelectHandle = ctx.components.mountMultiSelect(incSlot, {
    value: [],
    placeholder: 'Filter by Tag (Include)...',
    searchPlaceholder: 'Search tags to include...',
    searchThreshold: 1,
    options: [],
    onChange: (vals) => {
      state.includeTags = vals || []
      refreshDropdownOptions()
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
      state.excludeTags = vals || []
      refreshDropdownOptions()
      onFilterChange(state)
    },
  })

  return {
    state,
    updateTagOptions: (data: any) => {
      if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === 'object' && 'tags' in data[0]) {
          allCharactersList = data
        } else if (data.length > 0 && typeof data[0] === 'string') {
          allCharactersList = data.map((t) => ({ id: t, name: t, tags: [t] }))
        }
      }
      refreshDropdownOptions()
    },
    destroy: () => {
      incSelect.destroy()
      excSelect.destroy()
    },
  }
}
