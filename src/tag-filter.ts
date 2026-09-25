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
    const charTags = Array.isArray(char.tags) ? char.tags : []
    const charTagSet = new Set(charTags)

    // 1. Exclusion (Strict: if card has ANY excluded tag, omit it)
    for (const tag of excSet) {
      if (charTagSet.has(tag)) return false
    }

    // 2. Inclusion (Card must have at least ONE included tag)
    if (incSet.size > 0) {
      let hasAnyIncluded = false
      for (const tag of incSet) {
        if (charTagSet.has(tag)) {
          hasAnyIncluded = true
          break
        }
      }
      if (!hasAnyIncluded) return false
    }

    return true
  })
}

export interface TagFilterMountResult {
  state: TagFilterState
  setCharacters: (characters: CharacterItemWithTags[]) => void
  destroy: () => void
}

export function mountTagFilterControls(
  ctx: SpindleFrontendContext,
  container: HTMLElement,
  onFilterChange: (state: TagFilterState) => void
): TagFilterMountResult {
  let allCharactersList: CharacterItemWithTags[] = []

  // ── Dropdown height ──
  // Change this one value to make the Tag Filter boxes taller or shorter.
  const DROPDOWN_HEIGHT = '26px'
  
  const state: TagFilterState = {
    includeTags: [],
    excludeTags: [],
  }

  container.replaceChildren()

  // HTML: Outer wrapper for the two tag-filter controls; flex-wrap keeps them usable on narrow screens.
  const wrap = document.createElement('div')
  // CSS (inline): lays the include/exclude controls out horizontally, with wrapping and spacing.
  wrap.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%;'

  // HTML: Slot that hosts the "include tag" multi-select component.
  const incSlot = document.createElement('div')
incSlot.style.cssText = `flex: 1; min-width: 140px; height: ${DROPDOWN_HEIGHT};`

  // HTML: Slot that hosts the "exclude tag" multi-select component.
  const excSlot = document.createElement('div')
excSlot.style.cssText = `flex: 1; min-width: 140px; height: ${DROPDOWN_HEIGHT};`

  wrap.append(incSlot, excSlot)
  container.appendChild(wrap)

  function refreshDropdownOptions() {
    const matchingCards = filterCharactersByTags(
      allCharactersList,
      state.includeTags,
      state.excludeTags
    )

    const availableTags = extractUniqueTags(matchingCards)

    const incSelectedSet = new Set(state.includeTags)
    const incUnselected = availableTags.filter((t) => !incSelectedSet.has(t))
    const incOptions = [...state.includeTags, ...incUnselected].map((t) => ({
      value: t,
      label: t,
    }))

    const excSelectedSet = new Set(state.excludeTags)
    const excUnselected = availableTags.filter((t) => !excSelectedSet.has(t))
    const excOptions = [...state.excludeTags, ...excUnselected].map((t) => ({
      value: t,
      label: t,
    }))

    incSelect.update({ options: incOptions })
    excSelect.update({ options: excOptions })
  }

  // HTML/component: Include-tag multi-select. This becomes the "Filter by Tag (Include)..." control.
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

  // HTML/component: Exclude-tag multi-select. This becomes the "Hide by Tag (Exclude)..." control.
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
    setCharacters: (characters: CharacterItemWithTags[]) => {
      allCharactersList = characters || []
      refreshDropdownOptions()
    },
    destroy: () => {
      incSelect.destroy()
      excSelect.destroy()
    },
  }
}