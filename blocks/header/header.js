import { getMetadata, decorateIcons } from '../../scripts/aem.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

export default class Header extends HTMLDivElement {
  static tagName = 'div';

  async connectedCallback() {
    // fetch nav content
    const navMeta = getMetadata('nav');
    const navPath = navMeta ? new URL(navMeta).pathname : '/nav';
    const resp = await fetch(`${navPath}.plain.html`);

    if (!resp.ok) {
      return;
    }

    const html = await resp.text();

    // decorate nav DOM
    const nav = document.createElement('nav');
    nav.id = 'nav';
    nav.innerHTML = html;

    const classes = ['brand', 'sections', 'tools'];
    classes.forEach((c, i) => {
      const section = nav.children[i];
      if (section) section.classList.add(`nav-${c}`);
    });

    const navSections = nav.querySelector('.nav-sections');
    if (navSections) {
      navSections.querySelectorAll(':scope > ul > li').forEach((navSection) => {
        if (navSection.querySelector('ul')) navSection.classList.add('nav-drop');
        navSection.addEventListener('click', () => {
          if (isDesktop.matches) {
            const expanded = navSection.getAttribute('aria-expanded') === 'true';
            this.toggleAllNavSections(navSections);
            navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          }
        });
      });
    }

    // hamburger for mobile
    const hamburger = document.createElement('div');
    hamburger.classList.add('nav-hamburger');
    hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
        <span class="nav-hamburger-icon"></span>
      </button>`;
    hamburger.addEventListener('click', () => this.toggleMenu(nav, navSections));
    nav.prepend(hamburger);
    nav.setAttribute('aria-expanded', 'false');
    // prevent mobile nav behavior on window resize
    this.toggleMenu(nav, navSections, isDesktop.matches);
    isDesktop.addEventListener('change', () => this.toggleMenu(nav, navSections, isDesktop.matches));

    decorateIcons(nav);
    const navWrapper = document.createElement('div');
    navWrapper.className = 'nav-wrapper';
    navWrapper.append(nav);
    this.append(navWrapper);
  }

  closeOnEscape(e) {
    if (e.code !== 'Escape') {
      return;
    }
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      this.toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      this.toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }

  openOnKeydown(e) {
    const focused = document.activeElement;
    const isNavDrop = focused.className === 'nav-drop';
    if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
      const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
      // eslint-disable-next-line no-use-before-define
      this.toggleAllNavSections(focused.closest('.nav-sections'));
      focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
    }
  }

  focusNavSection() {
    document.activeElement.addEventListener('keydown', this.openOnKeydown);
  }

  /**
   * Toggles all nav sections
   * @param {Element} sections The container element
   * @param {Boolean} expanded Whether the element should be expanded or collapsed
   */
  // eslint-disable-next-line class-methods-use-this
  toggleAllNavSections(sections, expanded = false) {
    sections.querySelectorAll('.nav-sections > ul > li').forEach((section) => {
      section.setAttribute('aria-expanded', expanded);
    });
  }

  /**
   * Toggles the entire nav
   * @param {Element} nav The container element
   * @param {Element} navSections The nav sections within the container element
   * @param {*} forceExpanded Optional param to force nav expand behavior when not null
   */
  toggleMenu(nav, navSections, forceExpanded = null) {
    const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
    const button = nav.querySelector('.nav-hamburger button');
    document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
    nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    this.toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
    button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
    // enable nav dropdown keyboard accessibility
    const navDrops = navSections.querySelectorAll('.nav-drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('role', 'button');
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', this.focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeAttribute('role');
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', this.focusNavSection);
      });
    }
    // enable menu collapse on escape keypress
    if (!expanded || isDesktop.matches) {
      // collapse menu on escape press
      window.addEventListener('keydown', this.closeOnEscape);
    } else {
      window.removeEventListener('keydown', this.closeOnEscape);
    }
  }
}
