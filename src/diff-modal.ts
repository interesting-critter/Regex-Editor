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

  // Remove any existing preview modal
  document.querySelectorAll('.rs-diff-modal-overlay').forEach((el) => el.remove())

  const overlay = document.createElement('div')
  overlay.className = 'rs-diff-modal-overlay'
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: var(--lumiverse-modal-backdrop, rgba(0, 0, 0, 0.65));
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    backdrop-filter: blur(4px);
    box-sizing: border-box;
  `

  let diffCardsHtml = ''
  for (const field of modifiedFields) {
    const diffContent = computeWordDiffHtml(field.oldValue, field.newValue)
    diffCardsHtml += `
      <div style="background: var(--lumiverse-fill, rgba(255, 255, 255, 0.03)); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius, 6px); overflow: hidden; margin-bottom: 12px; flex-shrink: 0;">
        <div style="background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.05)); padding: 8px 12px; font-weight: 600; font-size: 12.5px; border-bottom: 1px solid var(--lumiverse-border); display: flex; justify-content: space-between; align-items: center; color: var(--lumiverse-text, #fff);">
          <span>${field.label}</span>
          ${field.sublabel ? `<span style="font-size: 11px; color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.5)); font-weight: normal;">${field.sublabel}</span>` : ''}
        </div>
        <div style="padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; color: var(--lumiverse-text, #fff);">
          ${diffContent}
        </div>
      </div>
    `
  }

  overlay.innerHTML = `
    <div class="rs-diff-card" style="
      background: var(--lumiverse-gradient-modal, linear-gradient(135deg, rgba(35, 30, 48, 0.98), rgba(20, 17, 28, 0.98)));
      border: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.15));
      border-radius: calc(var(--lumiverse-radius, 8px) + 4px);
      width: min(940px, 92vw);
      height: min(82vh, 760px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      color: var(--lumiverse-text, #fff);
      box-sizing: border-box;
    ">
      <!-- Modal Header -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--lumiverse-border);
        flex-shrink: 0;
      ">
        <div style="font-weight: 600; font-size: 14.5px;">
          Preview Changes (${modifiedFields.length} field${modifiedFields.length === 1 ? '' : 's'} modified)
        </div>
        <button id="rs-portal-close-x" style="
          background: transparent;
          border: none;
          color: var(--lumiverse-text-muted, rgba(255, 255, 255, 0.6));
          font-size: 18px;
          cursor: pointer;
          border-radius: 4px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">✕</button>
      </div>

      <!-- Modal Body -->
      <div style="
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 14px 18px;
        gap: 10px;
        overflow: hidden;
        box-sizing: border-box;
      ">
        <div style="font-size: 12px; color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.6)); flex-shrink: 0;">
          Review replacements across all fields before applying. Deletions are in <span style="color: #f87171; font-weight: 500;">red</span> and additions in <span style="color: #4ade80; font-weight: 500;">green</span>.
        </div>

        <!-- Scrollable Diff Container -->
        <div style="
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-right: 6px;
        ">
          ${diffCardsHtml}
        </div>

        <!-- Pinned Actions Row -->
        <div style="
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid var(--lumiverse-border);
          flex-shrink: 0;
        ">
          <button id="rs-portal-cancel" style="
            background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.08));
            color: var(--lumiverse-text, #fff);
            border: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.2));
            border-radius: var(--lumiverse-radius, 6px);
            padding: 7px 18px;
            font-size: 12.5px;
            cursor: pointer;
            font-weight: 500;
          ">Cancel</button>
          <button id="rs-portal-apply" style="
            background: var(--lumiverse-accent, rgb(147, 112, 219));
            color: var(--lumiverse-accent-fg, #fff);
            border: 1px solid var(--lumiverse-accent, rgb(147, 112, 219));
            border-radius: var(--lumiverse-radius, 6px);
            padding: 7px 22px;
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
          ">Apply Changes</button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  const dismiss = () => {
    overlay.remove()
    document.removeEventListener('keydown', handleEsc)
  }

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss()
  }
  document.addEventListener('keydown', handleEsc)

  overlay.onclick = (e) => {
    if (e.target === overlay) dismiss()
  }

  const closeX = overlay.querySelector('#rs-portal-close-x') as HTMLButtonElement
  const cancelBtn = overlay.querySelector('#rs-portal-cancel') as HTMLButtonElement
  const applyBtn = overlay.querySelector('#rs-portal-apply') as HTMLButtonElement

  closeX.onclick = () => dismiss()
  cancelBtn.onclick = () => dismiss()

  applyBtn.onclick = () => {
    onConfirm()
    dismiss()
  }

  return true
}
