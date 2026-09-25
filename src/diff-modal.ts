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

  const modal = ctx.ui.showModal({
    title: `Preview Changes (${modifiedFields.length} field${modifiedFields.length === 1 ? '' : 's'} modified)`,
    width: 1200,
    maxHeight: 900,
  })

  // Prevent outer modal container from scrolling
  modal.root.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  `

  const shell = document.createElement('div')
  shell.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  `

  const body = document.createElement('div')
  body.style.cssText = `
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 2px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `

  const intro = document.createElement('div')
  intro.style.cssText = `
    font-size: 12px;
    color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.6));
    margin-bottom: 2px;
    flex-shrink: 0;
  `
  intro.innerHTML = `
    Review replacements across all fields before applying. Deletions are in
    <span style="color: #f87171; font-weight: 500;">red</span> and additions in
    <span style="color: #4ade80; font-weight: 500;">green</span>.
  `
  body.appendChild(intro)

  for (const field of modifiedFields) {
    const card = document.createElement('div')
    card.style.cssText = `
      background: var(--lumiverse-fill, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
    `

    const header = document.createElement('div')
    header.style.cssText = `
      background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.06));
      padding: 8px 12px;
      font-weight: 600;
      font-size: 12.5px;
      border-bottom: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    `

    const label = document.createElement('span')
    label.textContent = field.label
    header.appendChild(label)

    if (field.sublabel) {
      const sublabel = document.createElement('span')
      sublabel.textContent = field.sublabel
      sublabel.style.cssText = `
        font-size: 11px;
        color: var(--lumiverse-text-dim, rgba(255, 255, 255, 0.5));
        font-weight: normal;
        text-align: right;
      `
      header.appendChild(sublabel)
    }

    const diffContent = document.createElement('div')
    diffContent.style.cssText = `
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 280px;
      overflow-y: auto;
    `
    diffContent.innerHTML = computeWordDiffHtml(field.oldValue, field.newValue)

    card.append(header, diffContent)
    body.appendChild(card)
  }

  // Pinned footer
  const footer = document.createElement('div')
  footer.style.cssText = `
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 14px;
    margin-top: auto;
    border-top: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.2));
  `

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.style.cssText = `
    background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.08));
    color: var(--lumiverse-text, rgba(255, 255, 255, 0.9));
    border: 1px solid var(--lumiverse-border, rgba(128, 128, 128, 0.3));
    border-radius: 6px;
    padding: 7px 18px;
    font-size: 12.5px;
    cursor: pointer;
    font-weight: 500;
  `
  cancelBtn.addEventListener('click', () => modal.dismiss())

  const applyBtn = document.createElement('button')
  applyBtn.type = 'button'
  applyBtn.textContent = 'Apply Changes'
  applyBtn.style.cssText = `
    background: var(--lumiverse-accent, #9370db);
    color: var(--lumiverse-accent-fg, #ffffff);
    border: 1px solid var(--lumiverse-accent, #9370db);
    border-radius: 6px;
    padding: 7px 22px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  `
  applyBtn.addEventListener('click', () => {
    onConfirm()
    modal.dismiss()
  })

  footer.append(cancelBtn, applyBtn)
  shell.append(body, footer)
  modal.root.appendChild(shell)

  return true
}