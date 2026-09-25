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

  // ── Build Diff Cards HTML ──
  let diffCardsHtml = ''
  for (const field of modifiedFields) {
    const diffContent = computeWordDiffHtml(field.oldValue, field.newValue)
    diffCardsHtml += `
      <div style="background: var(--lumiverse-fill-subtle, rgba(255,255,255,0.03)); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); overflow: hidden; margin-bottom: 12px; flex-shrink: 0;">
        <div style="background: var(--lumiverse-fill-subtle, rgba(255,255,255,0.06)); padding: 8px 12px; font-weight: 600; font-size: 12.5px; border-bottom: 1px solid var(--lumiverse-border); display: flex; justify-content: space-between; align-items: center;">
          <span>${field.label}</span>
          ${field.sublabel ? `<span style="font-size: 11px; color: var(--lumiverse-text-dim); font-weight: normal;">${field.sublabel}</span>` : ''}
        </div>
        <div style="padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;">
          ${diffContent}
        </div>
      </div>
    `
  }

  // ── Create Modal Overlay Container (LumiScript Portal Style) ──
  const overlay = document.createElement('div')
  overlay.className = 'rs-custom-modal-overlay'
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: var(--lumiverse-modal-backdrop, rgba(0, 0, 0, 0.65));
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(4px);
    box-sizing: border-box;
  `

  overlay.innerHTML = `
    <div class="rs-custom-modal-card" style="
      background: var(--lumiverse-gradient-modal, linear-gradient(135deg, rgba(35, 30, 48, 0.98), rgba(20, 17, 28, 0.98)));
      background-color: var(--lumiverse-fill, #1a1721);
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius, 8px) + 4px);
      width: min(85vw, 1200px);
      height: min(75vh, 850px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      color: var(--lumiverse-text, #fff);
      box-sizing: border-box;
    ">
      <!-- Modal Header -->
      <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--lumiverse-border); flex-shrink: 0;">
        <div style="flex: 1; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px;">
          <span>Preview Changes (${modifiedFields.length} field${modifiedFields.length === 1 ? '' : 's'} modified)</span>
        </div>
        <button id="rs-modal-close-x" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--lumiverse-text-muted, #aaa); cursor: pointer; font-size: 16px;">✕</button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div style="flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column;">
        <div style="font-size: 12px; color: var(--lumiverse-text-dim, #888); margin-bottom: 12px; flex-shrink: 0;">
          Review replacements across all fields before applying. Deletions are in <span style="color: #f87171; font-weight: 500;">red</span> and additions in <span style="color: #4ade80; font-weight: 500;">green</span>.
        </div>
        <div style="flex: 1;">
          ${diffCardsHtml}
        </div>
      </div>

      <!-- Modal Footer (Always Pinned) -->
      <div style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.02)); flex-shrink: 0;">
        <button id="rs-modal-cancel" style="background: var(--lumiverse-fill-subtle, rgba(255,255,255,0.06)); color: var(--lumiverse-text, #fff); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius, 6px); padding: 8px 18px; font-size: 12.5px; cursor: pointer; font-weight: 500;">Cancel</button>
        <button id="rs-modal-apply" style="background: var(--lumiverse-accent, #7c3aed); color: var(--lumiverse-accent-fg, #fff); border: 1px solid var(--lumiverse-accent, #7c3aed); border-radius: var(--lumiverse-radius, 6px); padding: 8px 22px; font-size: 12.5px; font-weight: 600; cursor: pointer;">Apply Changes</button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  const closeModal = () => {
    window.removeEventListener('keydown', handleKeyDown)
    overlay.remove()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal()
  }
  window.addEventListener('keydown', handleKeyDown)

  // Backdrop click dismiss
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal()
  }

  overlay.querySelector('#rs-modal-close-x')?.addEventListener('click', closeModal)
  overlay.querySelector('#rs-modal-cancel')?.addEventListener('click', closeModal)
  overlay.querySelector('#rs-modal-apply')?.addEventListener('click', () => {
    onConfirm()
    closeModal()
  })

  return true
}
