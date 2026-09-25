import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

export interface FieldDiffItem {
  fieldId: string
  label: string
  sublabel?: string
  oldValue: string
  newValue: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Lightweight word-level token diff engine
 */
function computeWordDiffHtml(oldStr: string, newStr: string): string {
  const tokenize = (s: string) => s.match(/[\w']+|[^\w\s]+|\s+/g) || []
  const oldTokens = tokenize(oldStr)
  const newTokens = tokenize(newStr)

  const N = oldTokens.length
  const M = newTokens.length
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0))

  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      if (oldTokens[i] === newTokens[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1]
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  let i = 0
  let j = 0
  let html = ''

  while (i < N && j < M) {
    if (oldTokens[i] === newTokens[j]) {
      html += escapeHtml(oldTokens[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      html += `<del style="background: rgba(239, 68, 68, 0.25); color: #f87171; text-decoration: line-through; border-radius: 2px; padding: 0 2px;">${escapeHtml(oldTokens[i])}</del>`
      i++
    } else {
      html += `<ins style="background: rgba(34, 197, 94, 0.25); color: #4ade80; text-decoration: none; border-radius: 2px; padding: 0 2px; font-weight: 500;">${escapeHtml(newTokens[j])}</ins>`
      j++
    }
  }

  while (i < N) {
    html += `<del style="background: rgba(239, 68, 68, 0.25); color: #f87171; text-decoration: line-through; border-radius: 2px; padding: 0 2px;">${escapeHtml(oldTokens[i])}</del>`
    i++
  }
  while (j < M) {
    html += `<ins style="background: rgba(34, 197, 94, 0.25); color: #4ade80; text-decoration: none; border-radius: 2px; padding: 0 2px; font-weight: 500;">${escapeHtml(newTokens[j])}</ins>`
    j++
  }

  return html
}

export function showDiffPreviewModal(
  _ctx: SpindleFrontendContext,
  diffItems: FieldDiffItem[],
  onConfirm: () => void
) {
  const modifiedFields = diffItems.filter((d) => d.oldValue !== d.newValue)

  if (modifiedFields.length === 0) {
    return false
  }

  let diffCardsHtml = ''
  for (const field of modifiedFields) {
    const diffContent = computeWordDiffHtml(field.oldValue, field.newValue)
    diffCardsHtml += `
      <div style="background: var(--lumiverse-fill, rgba(255, 255, 255, 0.03)); border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2)); border-radius: 6px; overflow: hidden; flex-shrink: 0;">
        <div style="background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.06)); padding: 8px 12px; font-weight: 600; font-size: 12.5px; border-bottom: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2)); display: flex; justify-content: space-between; align-items: center;">
          <span>${field.label}</span>
          ${field.sublabel ? `<span style="font-size: 11px; color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.5)); font-weight: normal;">${field.sublabel}</span>` : ''}
        </div>
        <div style="padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow-y: auto;">
          ${diffContent}
        </div>
      </div>
    `
  }

  // Build the modal overlay shell directly into document.body
  const backdrop = document.createElement('div')
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 10010;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `

  backdrop.innerHTML = `
    <div id="rs-modal-card" style="
      width: 85vw;
      height: 75vh;
      max-width: 85vw;
      max-height: 75vh;
      background: var(--lumiverse-gradient-modal, linear-gradient(135deg, rgba(30, 26, 42, 0.98), rgba(18, 15, 26, 0.98)));
      border: 1px solid var(--lumiverse-border, rgba(147, 112, 219, 0.25));
      border-radius: 10px;
      color: var(--lumiverse-text, rgba(255, 255, 255, 0.92));
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
    ">
      <!-- Modal Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2)); flex-shrink: 0;">
        <span style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--lumiverse-accent, #9370db);">✦</span>
          Preview Changes (${modifiedFields.length} field${modifiedFields.length === 1 ? '' : 's'} modified)
        </span>
        <button id="rs-modal-close-x" style="background: none; border: none; color: var(--lumiverse-text-muted, rgba(255, 255, 255, 0.6)); cursor: pointer; padding: 4px; display: inline-flex; border-radius: 4px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Modal Body (Scrollable diff cards) -->
      <div style="flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
        <div style="font-size: 12px; color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.6)); margin-bottom: 2px;">
          Review replacements across all fields before applying. Deletions are in <span style="color: #f87171; font-weight: 500;">red</span> and additions in <span style="color: #4ade80; font-weight: 500;">green</span>.
        </div>
        ${diffCardsHtml}
      </div>

      <!-- Modal Footer (Always pinned at bottom) -->
      <div style="flex-shrink: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2)); background: rgba(0, 0, 0, 0.2);">
        <button id="rs-modal-cancel" style="background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.08)); color: var(--lumiverse-text, rgba(255, 255, 255, 0.9)); border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.3)); border-radius: 6px; padding: 7px 18px; font-size: 12.5px; cursor: pointer; font-weight: 500;">Cancel</button>
        <button id="rs-modal-apply" style="background: var(--lumiverse-accent, #9370db); color: var(--lumiverse-accent-fg, #ffffff); border: 1px solid var(--lumiverse-accent, #9370db); border-radius: 6px; padding: 7px 22px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Apply Changes</button>
      </div>
    </div>
  `

  document.body.appendChild(backdrop)

  const card = backdrop.querySelector('#rs-modal-card') as HTMLElement
  const closeX = backdrop.querySelector('#rs-modal-close-x') as HTMLButtonElement
  const cancelBtn = backdrop.querySelector('#rs-modal-cancel') as HTMLButtonElement
  const applyBtn = backdrop.querySelector('#rs-modal-apply') as HTMLButtonElement

  const dismiss = () => {
    window.removeEventListener('keydown', handleKey)
    backdrop.remove()
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss()
  }

  window.addEventListener('keydown', handleKey)

  // Backdrop click dismissal
  backdrop.onclick = (e) => {
    if (e.target === backdrop) dismiss()
  }
  card.onclick = (e) => e.stopPropagation()

  closeX.onclick = dismiss
  cancelBtn.onclick = dismiss

  applyBtn.onclick = () => {
    onConfirm()
    dismiss()
  }

  return true
}
