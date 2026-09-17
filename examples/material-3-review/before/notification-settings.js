/** Notification settings screen. */
import '@material/web/switch/switch.js';
import '@material/web/button/filled-button.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/icon/icon.js';

const CATEGORIES = [
  { id: 'mentions', name: 'Mentions' },
  { id: 'dms', name: 'Direct messages' },
  { id: 'updates', name: 'Product updates' },
];

const SOUNDS = ['Chime', 'Pulse', 'Marimba', 'None'];

export class NotificationSettings extends HTMLElement {
  constructor() {
    super();
    this.enabled = true;
    this.delivery = { mentions: 'immediate', dms: 'immediate', updates: 'off' };
    this.sound = 'Chime';
    this.dndStart = '22:00';
    this.dndEnd = '07:00';
    this.sending = false;
  }

  connectedCallback() {
    this.render();
  }

  get dndInvalid() {
    return this.dndStart >= this.dndEnd;
  }

  dotColor(state) {
    if (state === 'immediate') return '#2e7d32';
    if (state === 'quiet') return '#f9a825';
    return '#9e9e9e';
  }

  async sendTest() {
    this.sending = true;
    this.render();
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.sending = false;
    this.render();
  }

  reset() {
    this.delivery = { mentions: 'off', dms: 'off', updates: 'off' };
    this.enabled = false;
    this.render();
  }

  render() {
    const immediateCount = Object.values(this.delivery).filter((d) => d === 'immediate').length;

    this.innerHTML = `
      <div class="page">
        <div class="title">Notifications</div>

        <div class="row">
          <span class="row-label">All notifications</span>
          <md-switch ${this.enabled ? 'selected' : ''} id="all"></md-switch>
        </div>

        <div class="section ${this.enabled ? '' : 'is-disabled'}">
          ${CATEGORIES.map(
            (c) => `
            <div class="row">
              <span class="dot" style="background:${this.dotColor(this.delivery[c.id])}"></span>
              <span class="row-label">${c.name}</span>
              <md-outlined-select class="delivery" data-id="${c.id}" ${this.enabled ? '' : 'disabled'}>
                <md-select-option value="off" ${this.delivery[c.id] === 'off' ? 'selected' : ''}>
                  <div slot="headline">Off</div>
                </md-select-option>
                <md-select-option value="quiet" ${this.delivery[c.id] === 'quiet' ? 'selected' : ''}>
                  <div slot="headline">Quiet</div>
                </md-select-option>
                <md-select-option value="immediate" ${this.delivery[c.id] === 'immediate' ? 'selected' : ''}>
                  <div slot="headline">Immediate</div>
                </md-select-option>
              </md-outlined-select>
              <md-icon-button class="info" data-id="${c.id}">
                <md-icon>info</md-icon>
              </md-icon-button>
            </div>`,
          ).join('')}
        </div>

        <div class="row">
          <span class="row-label">Do not disturb</span>
          <input type="time" id="dnd-start" placeholder="Start" value="${this.dndStart}"
                 class="${this.dndInvalid ? 'invalid' : ''}">
          <input type="time" id="dnd-end" placeholder="End" value="${this.dndEnd}"
                 class="${this.dndInvalid ? 'invalid' : ''}">
        </div>

        <div class="row">
          <span class="row-label">Sound</span>
          <md-outlined-select id="sound">
            ${SOUNDS.map(
              (s) => `<md-select-option value="${s}" ${s === this.sound ? 'selected' : ''}>
                        <div slot="headline">${s}</div>
                      </md-select-option>`,
            ).join('')}
          </md-outlined-select>
        </div>

        <p class="count">${immediateCount} categories set to Immediate</p>

        <div class="actions">
          <md-filled-button id="save">Save</md-filled-button>
          <md-filled-button id="test" ${this.sending ? 'disabled' : ''}>Send test</md-filled-button>
          <md-filled-button id="reset">Reset all settings</md-filled-button>
        </div>
      </div>
    `;

    this.querySelector('#all').addEventListener('change', (e) => {
      this.enabled = e.target.selected;
      this.render();
    });
    this.querySelectorAll('.delivery').forEach((select) => {
      select.addEventListener('change', (e) => {
        this.delivery[e.target.dataset.id] = e.target.value;
        this.render();
      });
    });
    this.querySelector('#test').addEventListener('click', () => this.sendTest());
    this.querySelector('#reset').addEventListener('click', () => this.reset());
    this.querySelector('#dnd-start').addEventListener('change', (e) => {
      this.dndStart = e.target.value;
      this.render();
    });
    this.querySelector('#dnd-end').addEventListener('change', (e) => {
      this.dndEnd = e.target.value;
      this.render();
    });
  }
}

customElements.define('notification-settings', NotificationSettings);
