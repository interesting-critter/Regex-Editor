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
  updateTagOptions: (tags: string[]) => void
  destroy: () => void
}

/**
 * Builds tag options with selected tags pinned to the top,
 * and unselected tags in their original alphabetical order.
 */
function buildSortedTagOptions(
  allTags: string[],
  selectedTags: string[]
): Array<{ value: string; label: string }> {
  const selSet = new Set(selectedTags)
  const selectedList = allTags.filter((t) => selSet.has(t))
  const unselectedList = allTags.filter((t) => !selSet.has(t))

  return [...selectedList, ...unselectedList].map((t) => ({ value: t, label: t }))
}

export function mountTagFilterControls(
  ctx: SpindleFrontendContext,
  container: HTMLElement,
  onFilterChange: (state: TagFilterState) => void
): TagFilterMountResult {
  let allTagsList: string[] = []

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

  const incSelect: SpindleMultiSelectHandle = ctx.components.mountMultiSelect(incSlot, {
    value: [],
    placeholder: 'Filter by Tag (Include)...',
    searchPlaceholder: 'Search tags to include...',
    searchThreshold: 1,
    options: [],
    onChange: (vals) => {
      state.includeTags = vals || []
      incSelect.update({
        options: buildSortedTagOptions(allTagsList, state.includeTags),
      })
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
      excSelect.update({
        options: buildSortedTagOptions(allTagsList, state.excludeTags),
      })
      onFilterChange(state)
    },
  })

  return {
    state,
    updateTagOptions: (tags: string[]) => {
      allTagsList = tags
      incSelect.update({
        options: buildSortedTagOptions(allTagsList, state.includeTags),
      })
      excSelect.update({
        options: buildSortedTagOptions(allTagsList, state.excludeTags),
      })
    },
    destroy: () => {
      incSelect.destroy()
      excSelect.destroy()
    },
  }
}