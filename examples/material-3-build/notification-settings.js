/**
 * <notification-settings>
 *
 * Notification settings screen built on @material/web 2.5.0.
 *
 * Component choices and their justification live in NOTES.md. In short:
 * every colour, type and shape value comes from a --md-sys-* role token so the
 * screen follows the host page's theme in both light and dark appearance.
 */

// Stable (non-labs) components only. Imported individually rather than via
// `all.js`, which the library documents as prototyping-only.
import '@material/web/switch/switch.js';
import '@material/web/radio/radio.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/divider/divider.js';

const CATEGORIES = [
  {
    id: 'mentions',
    label: 'Mentions',
    description: 'When someone types your name',
  },
  {
    id: 'direct-messages',
    label: 'Direct messages',
    description: 'Messages sent only to you',
  },
  {
    id: 'product-updates',
    label: 'Product updates',
    description: 'Release notes and announcements',
  },
];

const DELIVERY = [
  {id: 'off', label: 'Off', hint: 'No notification'},
  {id: 'quiet', label: 'Quiet', hint: 'Delivered silently'},
  {id: 'immediate', label: 'Immediate', hint: 'Sound and banner'},
];

const SOUNDS = [
  {id: 'chime', label: 'Chime'},
  {id: 'ping', label: 'Ping'},
  {id: 'marimba', label: 'Marimba'},
  {id: 'none', label: 'None (silent)'},
];

const DEFAULT_STATE = Object.freeze({
  enabled: true,
  delivery: {
    mentions: 'immediate',
    'direct-messages': 'immediate',
    'product-updates': 'quiet',
  },
  dndStart: '22:00',
  dndEnd: '07:00',
  sound: 'chime',
});

// Inline SVG rather than <md-icon>, because <md-icon> renders a ligature from
// the Material Symbols font, which this screen may not load (no network).
const ICON_CHECK = `<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 16.2 4.8 11.4l1.4-1.4 3.4 3.4 8-8 1.4 1.4z"/></svg>`;
const ICON_ERROR = `<svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1-4h2V7h-2v6Zm1 9a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/></svg>`;

const STYLESHEET_HREF = new URL('./notification-settings.css', import.meta.url)
  .href;

export class NotificationSettings extends HTMLElement {
  #state = structuredClone(DEFAULT_STATE);
  #testStatus = {phase: 'idle', message: ''};
  #rendered = false;

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = this.#template();
    this.#wire();
    this.#syncDerived();
  }

  /** Current settings, for the surrounding app to read or persist. */
  get value() {
    return structuredClone(this.#state);
  }

  set value(next) {
    this.#state = {...structuredClone(DEFAULT_STATE), ...structuredClone(next)};
    if (this.#rendered) {
      this.#applyStateToControls();
      this.#syncDerived();
    }
  }

  get #immediateCount() {
    return Object.values(this.#state.delivery).filter((v) => v === 'immediate')
      .length;
  }

  #template() {
    return `
      <link rel="stylesheet" href="${STYLESHEET_HREF}">
      <section class="screen" aria-labelledby="screen-title">
        <header class="screen-header">
          <h1 id="screen-title" class="title">Notification settings</h1>
          <p class="subtitle">Choose what reaches you, and when.</p>
        </header>

        <div class="panes">
          <div class="pane pane-primary">
            <!-- Master switch. A switch is the Material component for toggling
                 one independent setting that takes effect immediately. -->
            <div class="card master">
              <label class="row row-switch" for="master-switch">
                <span class="row-text">
                  <span class="row-label">All notifications</span>
                  <span class="row-support" id="master-support">
                    Turning this off silences every category.
                  </span>
                </span>
                <md-switch
                  id="master-switch"
                  selected
                  aria-describedby="master-support"></md-switch>
              </label>
            </div>

            <!-- Per-category delivery. Radio groups, not segmented buttons:
                 see NOTES.md for why. -->
            <section
              class="card categories"
              id="categories"
              aria-labelledby="categories-title">
              <h2 class="section-title" id="categories-title">Categories</h2>
              <p class="section-support" id="categories-support">
                Each category is delivered off, quietly, or immediately.
              </p>
              <p class="section-disabled-note" id="categories-disabled-note" hidden>
                Categories are unavailable while all notifications are off.
              </p>
              ${CATEGORIES.map((category) => this.#categoryTemplate(category)).join(
                '',
              )}
            </section>
          </div>

          <div class="pane pane-secondary">
            <section class="card" aria-labelledby="dnd-title">
              <h2 class="section-title" id="dnd-title">Do not disturb</h2>
              <p class="section-support" id="dnd-support">
                Notifications are held between these times. A window that ends
                before it starts runs overnight.
              </p>
              <div class="time-row">
                <md-outlined-text-field
                  id="dnd-start"
                  type="time"
                  label="Start"
                  value="${DEFAULT_STATE.dndStart}"
                  aria-describedby="dnd-support"></md-outlined-text-field>
                <span class="time-separator" aria-hidden="true">to</span>
                <md-outlined-text-field
                  id="dnd-end"
                  type="time"
                  label="End"
                  value="${DEFAULT_STATE.dndEnd}"
                  aria-describedby="dnd-support"></md-outlined-text-field>
              </div>
              <p class="dnd-readout" id="dnd-readout"></p>
            </section>

            <section class="card" aria-labelledby="sound-title">
              <h2 class="section-title" id="sound-title">Sound</h2>
              <md-outlined-select
                id="sound"
                label="Notification sound"
                supporting-text="Used for categories set to Immediate.">
                ${SOUNDS.map(
                  (sound) => `
                  <md-select-option
                    value="${sound.id}"
                    ${sound.id === DEFAULT_STATE.sound ? 'selected' : ''}>
                    <div slot="headline">${sound.label}</div>
                  </md-select-option>`,
                ).join('')}
              </md-outlined-select>
            </section>

            <section class="card summary-card" aria-labelledby="summary-title">
              <h2 class="section-title" id="summary-title">Summary</h2>
              <!-- Count is the screen's derived status, announced politely
                   rather than as an alert. -->
              <p class="summary" id="immediate-summary" role="status"></p>
              <md-divider></md-divider>
              <div class="actions">
                <md-filled-button id="send-test">
                  Send test notification
                </md-filled-button>
                <md-text-button id="reset">Reset to defaults</md-text-button>
                <md-circular-progress
                  id="test-progress"
                  indeterminate
                  aria-hidden="true"
                  hidden></md-circular-progress>
              </div>
              <!-- Result is a live region; it carries an icon and text, so the
                   success/failure distinction is not colour alone. -->
              <p class="test-status" id="test-status" role="status"></p>
            </section>
          </div>
        </div>
      </section>
    `;
  }

  #categoryTemplate({id, label, description}) {
    const groupLabelId = `${id}-label`;
    const groupSupportId = `${id}-support`;
    return `
      <div class="category" data-category="${id}">
        <div class="category-text">
          <span class="row-label" id="${groupLabelId}">${label}</span>
          <span class="row-support" id="${groupSupportId}">${description}</span>
        </div>
        <div
          class="choices"
          role="radiogroup"
          aria-labelledby="${groupLabelId}"
          aria-describedby="${groupSupportId}">
          ${DELIVERY.map((option) => {
            const inputId = `${id}-${option.id}`;
            return `
            <label class="choice" for="${inputId}">
              <md-radio
                id="${inputId}"
                name="${id}"
                value="${option.id}"
                touch-target="wrapper"
                aria-label="${label}: ${option.label}. ${option.hint}."
                ${
                  DEFAULT_STATE.delivery[id] === option.id ? 'checked' : ''
                }></md-radio>
              <span class="choice-text">
                <span class="choice-label">${option.label}</span>
                <span class="choice-hint">${option.hint}</span>
              </span>
            </label>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  #wire() {
    const root = this.shadowRoot;

    root.getElementById('master-switch').addEventListener('change', (event) => {
      this.#state.enabled = event.target.selected;
      this.#syncDerived();
      this.#emitChange();
    });

    for (const category of CATEGORIES) {
      for (const option of DELIVERY) {
        const radio = root.getElementById(`${category.id}-${option.id}`);
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          this.#state.delivery[category.id] = option.id;
          this.#syncDerived();
          this.#emitChange();
        });
      }
    }

    for (const [id, key] of [
      ['dnd-start', 'dndStart'],
      ['dnd-end', 'dndEnd'],
    ]) {
      root.getElementById(id).addEventListener('input', (event) => {
        this.#state[key] = event.target.value;
        this.#syncDerived();
        this.#emitChange();
      });
    }

    root.getElementById('sound').addEventListener('change', (event) => {
      this.#state.sound = event.target.value;
      this.#emitChange();
    });

    root
      .getElementById('send-test')
      .addEventListener('click', () => this.#sendTest());

    root.getElementById('reset').addEventListener('click', () => {
      this.value = structuredClone(DEFAULT_STATE);
      this.#setTestStatus('idle', '');
      this.#emitChange();
    });
  }

  #applyStateToControls() {
    const root = this.shadowRoot;
    root.getElementById('master-switch').selected = this.#state.enabled;
    for (const category of CATEGORIES) {
      for (const option of DELIVERY) {
        root.getElementById(`${category.id}-${option.id}`).checked =
          this.#state.delivery[category.id] === option.id;
      }
    }
    root.getElementById('dnd-start').value = this.#state.dndStart;
    root.getElementById('dnd-end').value = this.#state.dndEnd;
    root.getElementById('sound').value = this.#state.sound;
  }

  /** Recomputes everything derived from state: disabled states, counts, text. */
  #syncDerived() {
    const root = this.shadowRoot;
    const {enabled} = this.#state;

    // Dependent controls are disabled, not hidden, so the structure of the
    // screen does not change underneath the user when the master switch flips.
    for (const category of CATEGORIES) {
      for (const option of DELIVERY) {
        root.getElementById(`${category.id}-${option.id}`).disabled = !enabled;
      }
    }
    for (const id of ['dnd-start', 'dnd-end', 'sound', 'send-test']) {
      root.getElementById(id).disabled = !enabled;
    }
    root.getElementById('categories').classList.toggle('is-disabled', !enabled);
    root.getElementById('categories-disabled-note').hidden = enabled;

    const count = this.#immediateCount;
    root.getElementById('immediate-summary').textContent = enabled
      ? `${count} of ${CATEGORIES.length} categories ${
          count === 1 ? 'is' : 'are'
        } set to Immediate.`
      : 'All notifications are off, so nothing is delivered immediately.';

    root.getElementById('dnd-readout').textContent = this.#dndReadout();
  }

  #dndReadout() {
    const {dndStart, dndEnd} = this.#state;
    if (!dndStart || !dndEnd) {
      return 'Set both a start and an end time to use Do not disturb.';
    }
    if (dndStart === dndEnd) {
      return 'Start and end are the same, so Do not disturb never runs.';
    }
    const overnight = dndStart > dndEnd;
    return `Quiet from ${formatTime(dndStart)} to ${formatTime(dndEnd)}${
      overnight ? ' the next day.' : '.'
    }`;
  }

  async #sendTest() {
    this.#setTestStatus('sending', 'Sending test notification…');
    try {
      const result = await this.#deliverTest();
      this.#setTestStatus(
        'success',
        `Test notification sent (${result}).`,
      );
    } catch (error) {
      this.#setTestStatus(
        'error',
        `Could not send the test notification: ${error.message} Check the browser's notification permission and try again.`,
      );
    }
  }

  /**
   * Uses the browser Notification API when it is available and permitted, and
   * otherwise reports a failure the user can act on. No network is used.
   */
  async #deliverTest() {
    if (!('Notification' in globalThis)) {
      throw new Error('this browser has no notification support.');
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      throw new Error(`permission is "${permission}".`);
    }
    const silent = this.#state.sound === 'none';
    new Notification('Test notification', {
      body: silent
        ? 'Delivered silently.'
        : `Delivered with the ${this.#state.sound} sound.`,
      silent,
    });
    return silent ? 'silent' : `sound: ${this.#state.sound}`;
  }

  #setTestStatus(phase, message) {
    this.#testStatus = {phase, message};
    const root = this.shadowRoot;
    const status = root.getElementById('test-status');
    const progress = root.getElementById('test-progress');
    const button = root.getElementById('send-test');

    progress.hidden = phase !== 'sending';
    button.disabled = phase === 'sending' || !this.#state.enabled;

    status.className = `test-status is-${phase}`;
    // An error is announced assertively; a success is not worth interrupting.
    status.setAttribute('role', phase === 'error' ? 'alert' : 'status');
    if (phase === 'success') {
      status.innerHTML = `${ICON_CHECK}<span>${message}</span>`;
    } else if (phase === 'error') {
      status.innerHTML = `${ICON_ERROR}<span>${message}</span>`;
    } else {
      status.textContent = message;
    }
  }

  #emitChange() {
    this.dispatchEvent(
      new CustomEvent('settings-change', {
        detail: this.value,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const date = new Date(2000, 0, 1, hours, minutes);
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

if (!customElements.get('notification-settings')) {
  customElements.define('notification-settings', NotificationSettings);
}
