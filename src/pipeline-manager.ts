import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import type { RegexPreset, PipelineStep } from './pipeline-types'

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function runPipelineOnText(text: string, steps: PipelineStep[]): string {
  let result = text
  for (const step of steps) {
    if (!step.find) continue
    try {
      let rx: RegExp
      if (!step.useRegex) {
        rx = new RegExp(escapeRegExp(step.find), step.flags.i ? 'gi' : 'g')
      } else {
        let flagStr = ''
        if (step.flags.g) flagStr += 'g'
        if (step.flags.i) flagStr += 'i'
        if (step.flags.m) flagStr += 'm'
        if (step.flags.s) flagStr += 's'
        rx = new RegExp(step.find, flagStr)
      }
      result = step.useRegex
        ? result.replace(rx, step.replace)
        : result.replace(rx, () => step.replace)
    } catch {
      // Ignore invalid regex in single pipeline step
    }
  }
  return result
}

export function createPipelineStep(): PipelineStep {
  return {
    id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    find: '',
    replace: '',
    useRegex: true,
    flags: { g: true, i: false, m: true, s: true },
  }
}

export class PipelineManagerUI {
  private ctx: SpindleFrontendContext
  private container: HTMLElement
  private presets: RegexPreset[] = []
  private activePreset: RegexPreset | null = null

  constructor(ctx: SpindleFrontendContext, container: HTMLElement) {
    this.ctx = ctx
    this.container = container
    this.renderShell()
  }

  public setPresets(presets: RegexPreset[]) {
    this.presets = presets
    this.updateDropdown()
    if (this.activePreset) {
      const refreshed = presets.find((p) => p.id === this.activePreset!.id)
      if (refreshed) {
        this.activePreset = refreshed
        this.renderSteps()
      }
    }
  }

  public selectPresetById(id: string) {
    const found = this.presets.find((p) => p.id === id)
    if (found) {
      this.activePreset = JSON.parse(JSON.stringify(found))
      const select = this.container.querySelector('#rs-pipe-preset-select') as HTMLSelectElement
      if (select) select.value = id
      this.renderSteps()
    }
  }

  private renderShell() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div class="rs-row" style="justify-content: space-between;">
          <div class="rs-row" style="flex: 1;">
            <select id="rs-pipe-preset-select" class="rs-input" style="flex: 1;">
              <option value="">-- Choose Pipeline Preset --</option>
            </select>
            <button class="rs-btn" id="rs-pipe-new-btn">+ New Preset</button>
          </div>
          <div class="rs-row">
            <button class="rs-btn" id="rs-pipe-del-btn" style="color: #f87171;" disabled>Delete</button>
            <button class="rs-btn rs-btn-primary" id="rs-pipe-save-btn" disabled>Save Preset</button>
          </div>
        </div>

        <div id="rs-pipe-meta-box" style="display: none; flex-direction: column; gap: 6px;">
          <input type="text" id="rs-pipe-name-input" class="rs-input" placeholder="Preset Name" style="font-weight: 600;" />
        </div>

        <div id="rs-pipe-steps-container" style="display: flex; flex-direction: column; gap: 10px; max-height: 52vh; overflow-y: auto; padding-right: 2px;"></div>

        <div id="rs-pipe-footer" style="display: none;" class="rs-row">
          <button class="rs-btn rs-btn-primary" id="rs-pipe-add-step-btn" style="width: 100%;">+ Add Regex Step</button>
        </div>
      </div>
    `

    const select = this.container.querySelector('#rs-pipe-preset-select') as HTMLSelectElement
    const newBtn = this.container.querySelector('#rs-pipe-new-btn') as HTMLButtonElement
    const delBtn = this.container.querySelector('#rs-pipe-del-btn') as HTMLButtonElement
    const saveBtn = this.container.querySelector('#rs-pipe-save-btn') as HTMLButtonElement
    const addStepBtn = this.container.querySelector('#rs-pipe-add-step-btn') as HTMLButtonElement
    const nameInput = this.container.querySelector('#rs-pipe-name-input') as HTMLInputElement

    select.onchange = () => {
      this.selectPresetById(select.value)
    }

    newBtn.onclick = () => {
      this.activePreset = {
        id: `preset_${Date.now()}`,
        name: `New Pipeline (${this.presets.length + 1})`,
        steps: [createPipelineStep()],
      }
      this.renderSteps()
    }

    nameInput.oninput = () => {
      if (this.activePreset) this.activePreset.name = nameInput.value
    }

    saveBtn.onclick = () => {
      if (!this.activePreset) return
      this.ctx.sendToBackend({ type: 'save_preset', preset: this.activePreset })
    }

    delBtn.onclick = () => {
      if (!this.activePreset) return
      this.ctx.sendToBackend({ type: 'delete_preset', presetId: this.activePreset.id })
      this.activePreset = null
      this.renderSteps()
    }

    addStepBtn.onclick = () => {
      if (!this.activePreset) return
      this.activePreset.steps.push(createPipelineStep())
      this.renderSteps()
    }
  }

  private updateDropdown() {
    const select = this.container.querySelector('#rs-pipe-preset-select') as HTMLSelectElement
    if (!select) return
    select.innerHTML = '<option value="">-- Choose Pipeline Preset --</option>'
    this.presets.forEach((p) => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      select.appendChild(opt)
    })
    if (this.activePreset) select.value = this.activePreset.id
  }

  private renderSteps() {
    const stepsContainer = this.container.querySelector('#rs-pipe-steps-container') as HTMLElement
    const metaBox = this.container.querySelector('#rs-pipe-meta-box') as HTMLElement
    const footer = this.container.querySelector('#rs-pipe-footer') as HTMLElement
    const delBtn = this.container.querySelector('#rs-pipe-del-btn') as HTMLButtonElement
    const saveBtn = this.container.querySelector('#rs-pipe-save-btn') as HTMLButtonElement
    const nameInput = this.container.querySelector('#rs-pipe-name-input') as HTMLInputElement

    stepsContainer.innerHTML = ''

    if (!this.activePreset) {
      metaBox.style.display = 'none'
      footer.style.display = 'none'
      delBtn.disabled = true
      saveBtn.disabled = true
      stepsContainer.innerHTML = `
        <div style="text-align: center; color: var(--lumiverse-text-dim); padding: 30px 10px;">
          Choose an existing pipeline above or click <b>+ New Preset</b> to create a multi-step regex sequence.
        </div>
      `
      return
    }

    metaBox.style.display = 'flex'
    footer.style.display = 'flex'
    delBtn.disabled = false
    saveBtn.disabled = false
    nameInput.value = this.activePreset.name

    this.activePreset.steps.forEach((step, idx) => {
      const stepCard = document.createElement('div')
      stepCard.className = 'rs-card'
      stepCard.style.cssText = 'border: 1px solid var(--lumiverse-border);'

      stepCard.innerHTML = `
        <div class="rs-row" style="justify-content: space-between;">
          <div class="rs-row">
            <span style="font-weight: 600; font-size: 12px; color: var(--lumiverse-accent);">Step ${idx + 1}</span>
            <label class="rs-chip ${step.useRegex ? 'active' : ''}" id="rs-step-toggle-regex">.* Regex</label>
            <span style="font-size: 11px; color: var(--lumiverse-text-dim);">Flags:</span>
            <label class="rs-chip ${step.flags.g ? 'active' : ''}" id="rs-step-flag-g">g</label>
            <label class="rs-chip ${step.flags.i ? 'active' : ''}" id="rs-step-flag-i">i</label>
            <label class="rs-chip ${step.flags.m ? 'active' : ''}" id="rs-step-flag-m">m</label>
            <label class="rs-chip ${step.flags.s ? 'active' : ''}" id="rs-step-flag-s">s</label>
          </div>
          <button class="rs-btn" id="rs-step-del" style="padding: 2px 6px; font-size: 11px; color: #f87171;" title="Remove Step">✕</button>
        </div>
        <div class="rs-row">
          <input type="text" class="rs-input" id="rs-step-find" placeholder="Find pattern..." style="flex: 1;" value="${escapeHtml(step.find)}" />
          <input type="text" class="rs-input" id="rs-step-replace" placeholder="Replace pattern..." style="flex: 1;" value="${escapeHtml(step.replace)}" />
        </div>
      `

      // Step event handlers
      const findInput = stepCard.querySelector('#rs-step-find') as HTMLInputElement
      const replaceInput = stepCard.querySelector('#rs-step-replace') as HTMLInputElement
      const delStepBtn = stepCard.querySelector('#rs-step-del') as HTMLButtonElement
      const regexToggle = stepCard.querySelector('#rs-step-toggle-regex') as HTMLElement

      findInput.oninput = () => { step.find = findInput.value }
      replaceInput.oninput = () => { step.replace = replaceInput.value }

      regexToggle.onclick = () => {
        step.useRegex = !step.useRegex
        regexToggle.classList.toggle('active', step.useRegex)
      }

      ;(['g', 'i', 'm', 's'] as const).forEach((f) => {
        const flagEl = stepCard.querySelector(`#rs-step-flag-${f}`) as HTMLElement
        flagEl.onclick = () => {
          step.flags[f] = !step.flags[f]
          flagEl.classList.toggle('active', step.flags[f])
        }
      })

      delStepBtn.onclick = () => {
        this.activePreset!.steps = this.activePreset!.steps.filter((s) => s.id !== step.id)
        this.renderSteps()
      }

      stepsContainer.appendChild(stepCard)
    })
  }
}

function escapeHtml(str: string): string {
  return str.replace(/"/g, '&quot;')
}
