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
      <!-- HTML: Pipeline editor root; vertical layout that contains the entire preset editor. -->
      <!-- CSS: flex-column stacks the preset controls, metadata, steps, and footer with 10px gaps. -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <!-- HTML: Top control row containing preset selection/creation on the left and save/delete on the right. -->
        <!-- CSS: rs-row provides horizontal flex layout; space-between separates the two control groups. -->
        <div class="rs-row" style="justify-content: space-between;">
          <!-- HTML: Preset selector group. -->
          <div class="rs-row" style="flex: 1;">
            <!-- HTML: Dropdown for choosing an existing pipeline preset. -->
            <!-- CSS: rs-input gives the shared input appearance; flex:1 lets it consume available width. -->
            <select id="rs-pipe-preset-select" class="rs-input" style="flex: 1;">
              <!-- HTML: Empty/default option shown before a preset is selected. -->
              <option value="">-- Choose Pipeline Preset --</option>
            </select>
            <!-- HTML: Creates a new pipeline preset with one initial regex step. -->
            <button class="rs-btn" id="rs-pipe-new-btn">+ New Preset</button>
          </div>
          <!-- HTML: Preset persistence controls. -->
          <div class="rs-row">
            <!-- HTML: Deletes the currently selected preset; disabled until a preset is active. -->
            <!-- CSS: red text visually marks this as a destructive action. -->
            <button class="rs-btn" id="rs-pipe-del-btn" style="color: #f87171;" disabled>Delete</button>
            <!-- HTML: Saves the currently edited preset to the backend; disabled until a preset is active. -->
            <button class="rs-btn rs-btn-primary" id="rs-pipe-save-btn" disabled>Save Preset</button>
          </div>
        </div>

        <!-- HTML: Preset metadata section containing the editable preset name. -->
        <!-- CSS: hidden by default; becomes a vertical flex container when a preset is selected/created. -->
        <div id="rs-pipe-meta-box" style="display: none; flex-direction: column; gap: 6px;">
          <!-- HTML: Text input for naming the pipeline preset. -->
          <!-- CSS: rs-input supplies the shared input styling; font-weight emphasizes the name. -->
          <input type="text" id="rs-pipe-name-input" class="rs-input" placeholder="Preset Name" style="font-weight: 600;" />
        </div>

        <!-- HTML: Scrollable container where individual regex-step cards are rendered dynamically. -->
        <!-- CSS: vertical flex layout, 10px gaps, 52vh max height, and vertical scrolling. -->
        <div id="rs-pipe-steps-container" style="display: flex; flex-direction: column; gap: 10px; max-height: 52vh; overflow-y: auto; padding-right: 2px;"></div>

        <!-- HTML: Footer containing the add-step action; hidden until a preset is active. -->
        <div id="rs-pipe-footer" style="display: none;" class="rs-row">
          <!-- HTML: Adds another regex/replacement step to the active preset. -->
          <!-- CSS: primary button styling plus full-width layout. -->
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
      // HTML: One visual card representing one sequential regex/replacement operation.
      const stepCard = document.createElement('div')
      // CSS: rs-card supplies the shared card background/border/radius/padding; this inline rule reinforces the border.
      stepCard.className = 'rs-card'
      stepCard.style.cssText = 'border: 1px solid var(--lumiverse-border);'

      stepCard.innerHTML = `
        <!-- HTML: Step header; holds the step number, regex mode, flags, and delete action. -->
        <!-- CSS: rs-row lays the header contents out horizontally; space-between pushes delete to the far right. -->
        <div class="rs-row" style="justify-content: space-between;">
          <!-- HTML: Left-side step configuration controls. -->
          <div class="rs-row">
            <!-- HTML/CSS: Step number label; inline CSS makes it compact, bold, and accent-colored. -->
            <span style="font-weight: 600; font-size: 12px; color: var(--lumiverse-accent);">Step ${idx + 1}</span>
            <!-- HTML: Toggles whether this step interprets "Find" as a regex or literal text. -->
            <label class="rs-chip ${step.useRegex ? 'active' : ''}" id="rs-step-toggle-regex">.* Regex</label>
            <!-- HTML: Static label introducing the regex flags. -->
            <span style="font-size: 11px; color: var(--lumiverse-text-dim);">Flags:</span>
            <!-- HTML: Global flag toggle. -->
            <label class="rs-chip ${step.flags.g ? 'active' : ''}" id="rs-step-flag-g">g</label>
            <!-- HTML: Case-insensitive flag toggle. -->
            <label class="rs-chip ${step.flags.i ? 'active' : ''}" id="rs-step-flag-i">i</label>
            <!-- HTML: Multiline flag toggle. -->
            <label class="rs-chip ${step.flags.m ? 'active' : ''}" id="rs-step-flag-m">m</label>
            <!-- HTML: Dot-matches-newline flag toggle. -->
            <label class="rs-chip ${step.flags.s ? 'active' : ''}" id="rs-step-flag-s">s</label>
          </div>
          <!-- HTML/CSS: Deletes this step; inline CSS makes the control compact and red. -->
          <button class="rs-btn" id="rs-step-del" style="padding: 2px 6px; font-size: 11px; color: #f87171;" title="Remove Step">✕</button>
        </div>
        <!-- HTML: Input row containing the pattern to find and the replacement text. -->
        <div class="rs-row">
          <!-- HTML/CSS: Find-pattern input; rs-input supplies shared styling and flex:1 shares available width. -->
          <input type="text" class="rs-input" id="rs-step-find" placeholder="Find pattern..." style="flex: 1;" value="${escapeHtml(step.find)}" />
          <!-- HTML/CSS: Replacement-pattern input; same shared styling and flexible width. -->
          <input type="text" class="rs-input" id="rs-step-replace" placeholder="Replace pattern..." style="flex: 1;" value="${escapeHtml(step.replace)}" />
        </div>
      `

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