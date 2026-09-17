/**
 * Does the "before" screen actually run?
 *
 * A review example is only worth anything if the code under review is code someone could plausibly
 * have written and shipped. A straw man that throws on load tests nothing: any reviewer would find
 * "it does not run" and stop. So this mounts the component without the library (the custom elements
 * are irrelevant to its own logic) and asserts the screen renders with its controls present.
 *
 * Run: node examples/material-3-review/before/renders.mjs
 */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./notification-settings.js', import.meta.url), 'utf8');
// Strip the library imports; we are testing the component's own logic, not lit's rendering.
const body = src.replace(/^import .*$/gm, '').replace(/customElements\.define.*$/m, '');
globalThis.HTMLElement = class { querySelector(){return {addEventListener(){}}} querySelectorAll(){return []} };
const mod = await import('data:text/javascript,' + encodeURIComponent(body));
const el = new mod.NotificationSettings();
el.render();
const html = el.innerHTML;
console.log('rendered:', html.length, 'chars');
for (const [label, re] of [['switch', /<md-switch/], ['three selects', /md-outlined-select[\s\S]*md-outlined-select[\s\S]*md-outlined-select/],
  ['time inputs', /type="time"/], ['count line', /categories set to Immediate/], ['three filled buttons', /(md-filled-button[\s\S]*){3}/]])
  console.log(' ', re.test(html) ? 'OK' : 'MISSING', label);
console.log('immediate count line:', /(\d+) categories set to Immediate/.exec(html)?.[0]);
