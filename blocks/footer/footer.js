import { readBlockConfig, decorateIcons } from '../../scripts/aem.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default class Footer extends HTMLDivElement {
  static tagName = 'div';

  async connectedCallback() {
    const cfg = readBlockConfig(this);
    this.textContent = '';

    // fetch footer content
    const footerPath = cfg.footer || '/footer';
    const resp = await fetch(`${footerPath}.plain.html`, window.location.pathname.endsWith('/footer') ? { cache: 'reload' } : {});

    if (resp.ok) {
      const html = await resp.text();

      // decorate footer DOM
      const footer = document.createElement('div');
      footer.innerHTML = html;

      decorateIcons(footer);
      this.append(footer);
    }
  }
}
