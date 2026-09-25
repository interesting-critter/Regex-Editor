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
  ctx: SpindleFrontendContext,
  diffItems: FieldDiffItem[],
  onConfirm: () => void
) {
  const modifiedFields = diffItems.filter((d) => d.oldValue !== d.newValue)

  if (modifiedFields.length === 0) {
    return false
  }

  const winW = typeof window !== 'undefined' ? window.innerWidth : 800
  const winH = typeof window !== 'undefined' ? window.innerHeight : 600

  // 92% width on mobile, up to 760px on desktop
  const modalWidth = Math.min(760, Math.max(320, winW - 24))
  // 80% height on mobile, up to 680px on desktop
  const modalMaxHeight = Math.min(680, Math.max(380, Math.round(winH * 0.8)))

  const modal = ctx.ui.showModal({
    title: `Preview Changes (${modifiedFields.length} field${modifiedFields.length === 1 ? '' : 's'} modified)`,
    width: modalWidth,
    maxHeight: modalMaxHeight,
  })

  let diffCardsHtml = ''
  for (const field of modifiedFields) {
    const diffContent = computeWordDiffHtml(field.oldValue, field.newValue)
    diffCardsHtml += `
      <div style="background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); overflow: hidden; margin-bottom: 10px;">
        <div style="background: var(--lumiverse-fill-subtle); padding: 7px 10px; font-weight: 600; font-size: 12px; border-bottom: 1px solid var(--lumiverse-border); display: flex; justify-content: space-between; align-items: center;">
          <span>${field.label}</span>
          ${field.sublabel ? `<span style="font-size: 10.5px; color: var(--lumiverse-text-dim); font-weight: normal;">${field.sublabel}</span>` : ''}
        </div>
        <div style="padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow-y: auto;">
          ${diffContent}
        </div>
      </div>
    `
  }

  modal.root.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; color: var(--lumiverse-text); box-sizing: border-box;">
      <!-- Top Instruction -->
      <div style="font-size: 11.5px; color: var(--lumiverse-text-dim); margin-bottom: 2px;">
        Deletions are in <span style="color: #f87171; font-weight: 500;">red</span> and additions in <span style="color: #4ade80; font-weight: 500;">green</span>.
      </div>

      <!-- Scrollable Diff Area -->
      <div style="max-height: 50vh; min-height: 200px; overflow-y: auto; padding-right: 4px;">
        ${diffCardsHtml}
      </div>

      <!-- Pinned Bottom Footer -->
      <div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; border-top: 1px solid var(--lumiverse-border);">
        <button id="rs-modal-cancel" style="background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;">Cancel</button>
        <button id="rs-modal-apply" style="background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg, #fff); border: 1px solid var(--lumiverse-accent); border-radius: var(--lumiverse-radius); padding: 6px 16px; font-size: 12px; font-weight: 600; cursor: pointer;">Apply Changes</button>
      </div>
    </div>
  `

  const cancelBtn = modal.root.querySelector('#rs-modal-cancel') as HTMLButtonElement
  const applyBtn = modal.root.querySelector('#rs-modal-apply') as HTMLButtonElement

  cancelBtn.onclick = () => modal.dismiss()

  applyBtn.onclick = () => {
    onConfirm()
    modal.dismiss()
  }

  return true
}
