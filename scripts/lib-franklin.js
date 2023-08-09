/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * Loads a CSS file.
 * @param {string} href URL to the CSS file
 */
export async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

/**
 * Loads a non module JS file.
 * @param {string} src URL to the JS file
 * @param {Object} attrs additional optional attributes
 */

export async function loadScript(src, attrs) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      if (attrs) {
      // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const attr in attrs) {
          script.setAttribute(attr, attrs[attr]);
        }
      }
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    } else {
      resolve();
    }
  });
}

/**
 * Retrieves the content of metadata tags.
 * @param {string} name The metadata name (or property)
 * @returns {string} The metadata value(s)
 */
export function getMetadata(name) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = [...document.head.querySelectorAll(`meta[${attr}="${name}"]`)].map((m) => m.content).join(', ');
  return meta || '';
}

/**
 * Sanitizes a string for use as class name.
 * @param {string} name The unsanitized string
 * @returns {string} The class name
 */
export function toClassName(name) {
  return typeof name === 'string'
    ? name.toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : '';
}

/**
 * Sanitizes a string for use as a js property name.
 * @param {string} name The unsanitized string
 * @returns {string} The camelCased name
 */
export function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
export function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children) {
      const cols = [...row.children];
      if (cols[1]) {
        const col = cols[1];
        const name = toClassName(cols[0].textContent);
        let value = '';
        if (col.querySelector('a')) {
          const as = [...col.querySelectorAll('a')];
          if (as.length === 1) {
            value = as[0].href;
          } else {
            value = as.map((a) => a.href);
          }
        } else if (col.querySelector('img')) {
          const imgs = [...col.querySelectorAll('img')];
          if (imgs.length === 1) {
            value = imgs[0].src;
          } else {
            value = imgs.map((img) => img.src);
          }
        } else if (col.querySelector('p')) {
          const ps = [...col.querySelectorAll('p')];
          if (ps.length === 1) {
            value = ps[0].textContent;
          } else {
            value = ps.map((p) => p.textContent);
          }
        } else value = row.children[1].textContent;
        config[name] = value;
      }
    }
  });
  return config;
}

export const RumPlugin = () => {
  /**
   * log RUM if part of the sample.
   * @param {string} checkpoint identifies the checkpoint in funnel
   * @param {Object} data additional data for RUM sample
   */
  function sampleRUM(checkpoint, data = {}) {
    sampleRUM.defer = sampleRUM.defer || [];
    const defer = (fnname) => {
      sampleRUM[fnname] = sampleRUM[fnname]
        || ((...args) => sampleRUM.defer.push({ fnname, args }));
    };
    sampleRUM.drain = sampleRUM.drain
      || ((dfnname, fn) => {
        sampleRUM[dfnname] = fn;
        sampleRUM.defer
          .filter(({ fnname }) => dfnname === fnname)
          .forEach(({ fnname, args }) => sampleRUM[fnname](...args));
      });
    sampleRUM.on = (chkpnt, fn) => { sampleRUM.cases[chkpnt] = fn; };
    defer('observe');
    defer('cwv');
    try {
      window.hlx = window.hlx || {};
      if (!window.hlx.rum) {
        const usp = new URLSearchParams(window.location.search);
        const weight = (usp.get('rum') === 'on') ? 1 : 100; // with parameter, weight is 1. Defaults to 100.
        // eslint-disable-next-line no-bitwise
        const hashCode = (s) => s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);
        const id = `${hashCode(window.location.href)}-${new Date().getTime()}-${Math.random().toString(16).substr(2, 14)}`;
        const random = Math.random();
        const isSelected = (random * weight < 1);
        const urlSanitizers = {
          full: () => window.location.href,
          origin: () => window.location.origin,
          path: () => window.location.href.replace(/\?.*$/, ''),
        };
        // eslint-disable-next-line object-curly-newline, max-len
        window.hlx.rum = { weight, id, random, isSelected, sampleRUM, sanitizeURL: urlSanitizers[window.hlx.RUM_MASK_URL || 'path'] };
      }
      const { weight, id } = window.hlx.rum;
      if (window.hlx && window.hlx.rum && window.hlx.rum.isSelected) {
        const sendPing = (pdata = data) => {
          // eslint-disable-next-line object-curly-newline, max-len, no-use-before-define
          const body = JSON.stringify({ weight, id, referer: window.hlx.rum.sanitizeURL(), checkpoint, ...data });
          const url = `https://rum.hlx.page/.rum/${weight}`;
          // eslint-disable-next-line no-unused-expressions
          navigator.sendBeacon(url, body);
          // eslint-disable-next-line no-console
          console.debug(`ping:${checkpoint}`, pdata);
        };
        sampleRUM.cases = sampleRUM.cases || {
          cwv: () => sampleRUM.cwv(data) || true,
          lazy: () => {
            // use classic script to avoid CORS issues
            const script = document.createElement('script');
            script.src = 'https://rum.hlx.page/.rum/@adobe/helix-rum-enhancer@^1/src/index.js';
            document.head.appendChild(script);
            return true;
          },
        };
        sendPing(data);
        if (sampleRUM.cases[checkpoint]) { sampleRUM.cases[checkpoint](); }
      }
    } catch (error) {
      // something went wrong
    }
  }

  sampleRUM('top');

  window.addEventListener('load', () => sampleRUM('load'));

  return {
    name: 'rum',

    api: {
      sampleRUM,
    },

    preEager: async () => {
      window.addEventListener('unhandledrejection', (event) => {
        sampleRUM('error', { source: event.reason.sourceURL, target: event.reason.line });
      });
      window.addEventListener('error', (event) => {
        sampleRUM('error', { source: event.filename, target: event.lineno });
      });
    },

    postLazy: async () => {
      const main = document.querySelector('main');
      sampleRUM('lazy');
      sampleRUM.observe(main.querySelectorAll('div[data-block-name]'));
      sampleRUM.observe(main.querySelectorAll('picture > img'));
    },

    preDelayed: async () => {
      sampleRUM('cwv');
    },
  };
};

const ICONS_CACHE = {};
export const DecoratorPlugin = () => {
  /**
   * Replace icons with inline SVG and prefix with codeBasePath.
   * @param {Element} element
   */
  async function decorateIcons(element = document) {
    // Prepare the inline sprite
    let svgSprite = document.getElementById('franklin-svg-sprite');
    if (!svgSprite) {
      const div = document.createElement('div');
      div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" id="franklin-svg-sprite" style="display: none"></svg>';
      svgSprite = div.firstElementChild;
      document.body.append(div.firstElementChild);
    }

    // Download all new icons
    const icons = [...element.querySelectorAll('span.icon')];
    await Promise.all(icons.map(async (span) => {
      const iconName = Array.from(span.classList).find((c) => c.startsWith('icon-')).substring(5);
      if (!ICONS_CACHE[iconName]) {
        ICONS_CACHE[iconName] = true;
        try {
          const response = await fetch(`${window.hlx.codeBasePath}/icons/${iconName}.svg`);
          if (!response.ok) {
            ICONS_CACHE[iconName] = false;
            return;
          }
          // Styled icons don't play nice with the sprite approach because of shadow dom isolation
          // and same for internal references
          const svg = await response.text();
          if (svg.match(/(<style | class=|url\(#| xlink:href="#)/)) {
            ICONS_CACHE[iconName] = {
              styled: true,
              html: svg
                // rescope ids and references to avoid clashes across icons;
                .replaceAll(/ id="([^"]+)"/g, (_, id) => ` id="${iconName}-${id}"`)
                .replaceAll(/="url\(#([^)]+)\)"/g, (_, id) => `="url(#${iconName}-${id})"`)
                .replaceAll(/ xlink:href="#([^"]+)"/g, (_, id) => ` xlink:href="#${iconName}-${id}"`),
            };
          } else {
            ICONS_CACHE[iconName] = {
              html: svg
                .replace('<svg', `<symbol id="icons-sprite-${iconName}"`)
                .replace(/ width=".*?"/, '')
                .replace(/ height=".*?"/, '')
                .replace('</svg>', '</symbol>'),
            };
          }
        } catch (error) {
          ICONS_CACHE[iconName] = false;
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    }));

    const symbols = Object
      .keys(ICONS_CACHE).filter((k) => !svgSprite.querySelector(`#icons-sprite-${k}`))
      .map((k) => ICONS_CACHE[k])
      .filter((v) => !v.styled)
      .map((v) => v.html)
      .join('\n');
    svgSprite.innerHTML += symbols;

    icons.forEach((span) => {
      const iconName = Array.from(span.classList).find((c) => c.startsWith('icon-')).substring(5);
      const parent = span.firstElementChild?.tagName === 'A' ? span.firstElementChild : span;
      // Styled icons need to be inlined as-is, while unstyled ones can leverage the sprite
      if (ICONS_CACHE[iconName].styled) {
        parent.innerHTML = ICONS_CACHE[iconName].html;
      } else {
        parent.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><use href="#icons-sprite-${iconName}"/></svg>`;
      }
    });
  }

  /**
   * Decorates a block.
   * @param {Element} block The block element
   */
  function decorateBlock(block) {
    const shortBlockName = block.classList[0];
    if (shortBlockName) {
      block.classList.add('block');
      block.dataset.blockName = shortBlockName;
      block.dataset.blockStatus = 'initialized';
      const blockWrapper = block.parentElement;
      blockWrapper.classList.add(`${shortBlockName}-wrapper`);
      const section = block.closest('.section');
      if (section) section.classList.add(`${shortBlockName}-container`);
    }
  }

  /**
   * Decorates all sections in a container element.
   * @param {Element} $main The container element
   */
  function decorateSections(main) {
    main.querySelectorAll(':scope > div').forEach((section) => {
      const wrappers = [];
      let defaultContent = false;
      [...section.children].forEach((e) => {
        if (e.tagName === 'DIV' || !defaultContent) {
          const wrapper = document.createElement('div');
          wrappers.push(wrapper);
          defaultContent = e.tagName !== 'DIV';
          if (defaultContent) wrapper.classList.add('default-content-wrapper');
        }
        wrappers[wrappers.length - 1].append(e);
      });
      wrappers.forEach((wrapper) => section.append(wrapper));
      section.classList.add('section');
      section.dataset.sectionStatus = 'initialized';
      section.style.display = 'none';

      /* process section metadata */
      const sectionMeta = section.querySelector('div.section-metadata');
      if (sectionMeta) {
        const meta = readBlockConfig(sectionMeta);
        Object.keys(meta).forEach((key) => {
          if (key === 'style') {
            const styles = meta.style.split(',').map((style) => toClassName(style.trim()));
            styles.forEach((style) => section.classList.add(style));
          } else {
            section.dataset[toCamelCase(key)] = meta[key];
          }
        });
        sectionMeta.parentNode.remove();
      }
    });
  }

  /**
   * Decorates all blocks in a container element.
   * @param {Element} main The container element
   */
  function decorateBlocks(main) {
    main
      .querySelectorAll('div.section > div > div')
      .forEach(decorateBlock);
  }

  /**
   * Set template (page structure) and theme (page styles).
   */
  function decorateTemplateAndTheme() {
    const addClasses = (element, classes) => {
      classes.split(',').forEach((c) => {
        element.classList.add(toClassName(c.trim()));
      });
    };
    const template = getMetadata('template');
    if (template) addClasses(document.body, template);
    const theme = getMetadata('theme');
    if (theme) addClasses(document.body, theme);
  }

  /**
   * decorates paragraphs containing a single link as buttons.
   * @param {Element} element container element
   */
  function decorateButtons(element) {
    element.querySelectorAll('a').forEach((a) => {
      a.title = a.title || a.textContent;
      if (a.href !== a.textContent) {
        const up = a.parentElement;
        const twoup = a.parentElement.parentElement;
        if (!a.querySelector('img')) {
          if (up.childNodes.length === 1 && (up.tagName === 'P' || up.tagName === 'DIV')) {
            a.className = 'button primary'; // default
            up.classList.add('button-container');
          }
          if (up.childNodes.length === 1 && up.tagName === 'STRONG'
            && twoup.childNodes.length === 1 && twoup.tagName === 'P') {
            a.className = 'button primary';
            twoup.classList.add('button-container');
          }
          if (up.childNodes.length === 1 && up.tagName === 'EM'
            && twoup.childNodes.length === 1 && twoup.tagName === 'P') {
            a.className = 'button secondary';
            twoup.classList.add('button-container');
          }
        }
      }
    });
  }

  return {
    name: 'decorator',

    api: {
      decorateBlock,
      decorateBlocks,
      decorateButtons,
      decorateIcons,
      decorateSections,
    },

    preEager: () => {
      decorateTemplateAndTheme();
    },

    postEager: () => {
      const main = document.querySelector('main');
      decorateSections(main);
      decorateBlocks(main);
    },
  };
};

const plugins = {};
const pluginsApis = {};
const pluginContext = {
  getMetadata,
  loadCSS,
  readBlockConfig,
  toCamelCase,
  toClassName,
  plugins: pluginsApis,
};

/**
 * Registers a new plugin.
 * @param {string|function} pathOrFunction The plugin reference to be registered
 * @param {object} options An options map for the plugin
 * @returns the public API for the plugin, or null if not methods are exposed
 */
export async function withPlugin(pathOrFunction, options = {}) {
  if (options.condition && !options.condition.call(pluginContext)) {
    return null;
  }

  let plugin;
  let pluginName;
  let pluginBasePath = `${window.hlx.codeBasePath}/scripts/`;

  if (typeof pathOrFunction === 'string') {
    const pathTokens = pathOrFunction.split('/');
    pluginName = toCamelCase(pathTokens.pop().replace('.js', ''));
    pluginBasePath = new URL(pathTokens.join('/'), window.location.origin + pluginBasePath).pathname;
    if (pluginName === 'index') {
      pluginName = toCamelCase(pathTokens.pop());
    }
    plugin = await import(pathOrFunction);
    if (plugin.init) {
      plugin.init.call(pluginContext, options);
    } else if (plugin.default) {
      plugin.default.call(pluginContext, options);
    }
  } else if (typeof pathOrFunction === 'function') {
    plugin = pathOrFunction(options);
    pluginName = plugin.name || pathOrFunction.name;
  } else {
    throw new Error('Invalid plugin reference', pathOrFunction);
  }
  options.basePath = pluginBasePath;
  plugins[pluginName] = { ...plugin, options };
  if (plugin.api) {
    pluginsApis[pluginName] = plugin.api;
  }
  return plugin.api || null;
}

/**
 * Set/update plugin options after initialization.
 * @param {string} pluginName The plugin name
 * @param {object} options An options map for the plugin
 */
export async function setPluginOptions(pluginName, options) {
  plugins[pluginName].options = { ...plugins[pluginName].options, ...options };
}

/**
 * Updates all section status in a container element.
 * @param {Element} main The container element
 */
export function updateSectionsStatus(main) {
  const sections = [...main.querySelectorAll(':scope > div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const status = section.dataset.sectionStatus;
    if (status !== 'loaded') {
      const loadingBlock = section.querySelector('.block[data-block-status="initialized"], .block[data-block-status="loading"]');
      if (loadingBlock) {
        section.dataset.sectionStatus = 'loading';
        break;
      } else {
        section.dataset.sectionStatus = 'loaded';
        section.style.display = null;
      }
    }
  }
}

/**
 * Builds a block DOM Element from a two dimensional array, string, or object
 * @param {string} blockName name of the block
 * @param {*} content two dimensional array or string or object of content
 */
export function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return (blockEl);
}

/**
 * Gets the configuration for the given glock, and also passes
 * the config to the `patchBlockConfig` methods in the plugins.
 *
 * @param {Element} block The block element
 * @returns {object} The block config (blockName, cssPath and jsPath)
 */
function getBlockConfig(block) {
  const { blockName } = block.dataset;
  const cssPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`;
  const jsPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`;

  return Object.values(plugins).reduce((config, plugin) => (
    plugin.patchBlockConfig
      ? plugin.patchBlockConfig(config)
      : config
  ), {
    blockName,
    cssPath,
    jsPath,
  });
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
export async function loadBlock(block) {
  const status = block.dataset.blockStatus;
  if (status === 'loading' || status === 'loaded') {
    return;
  }
  block.dataset.blockStatus = 'loading';
  const { blockName, cssPath, jsPath } = getBlockConfig(block);
  try {
    const cssLoaded = loadCSS(cssPath);
    const decorationComplete = new Promise((resolve) => {
      (async () => {
        try {
          const mod = await import(jsPath);
          if (mod.default) {
            await mod.default.call(pluginContext, block);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log(`failed to load module for ${blockName}`, error);
        }
        resolve();
      })();
    });
    await Promise.all([cssLoaded, decorationComplete]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`failed to load block ${blockName}`, error);
  }
  block.dataset.blockStatus = 'loaded';
}

/**
 * Loads JS and CSS for all blocks in a container element.
 * @param {Element} main The container element
 */
export async function loadBlocks(main) {
  updateSectionsStatus(main);
  const blocks = [...main.querySelectorAll('div.block')];
  for (let i = 0; i < blocks.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(blocks[i]);
    updateSectionsStatus(main);
  }
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} [alt] The image alternative text
 * @param {boolean} [eager] Set loading attribute to eager
 * @param {Array} [breakpoints] Breakpoints and corresponding params (eg. width)
 * @returns {Element} The picture element
 */
export function createOptimizedPicture(src, alt = '', eager = false, breakpoints = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      picture.appendChild(img);
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
    }
  });

  return picture;
}

/**
 * Load LCP block and/or wait for LCP in default content.
 */
export async function waitForLCP(lcpBlocks) {
  const block = document.querySelector('.block');
  const hasLCPBlock = (block && lcpBlocks.includes(block.dataset.blockName));
  if (hasLCPBlock) await loadBlock(block);

  document.body.style.display = null;
  const lcpCandidate = document.querySelector('main img');
  await new Promise((resolve) => {
    if (lcpCandidate && !lcpCandidate.complete) {
      lcpCandidate.setAttribute('loading', 'eager');
      lcpCandidate.addEventListener('load', resolve);
      lcpCandidate.addEventListener('error', resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Loads a block named 'header' into header
 * @param {Element} header header element
 * @returns {Promise}
 */

export function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  pluginsApis.decorator.decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
 * Loads a block named 'footer' into footer
 * @param footer footer element
 * @returns {Promise}
 */

export function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  pluginsApis.decorator.decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

/**
 * Executes the specified phase in the page load.
 * @param {object[]} pluginsList A list of plugins to run in that phase
 * @param {string} phase The phase to run (one of eager, lazy, delayed)
 * @param {*} options The options for the page load
 */
async function execPhase(pluginsList, phase = 'lazy', options = {}) {
  let methodName = toCamelCase(`pre-${phase}`);
  await pluginsList.reduce((promise, plugin) => {
    const aggregatedOptions = { ...options, ...plugin.options };
    if (plugin[methodName]) {
      return promise.then(() => plugin[methodName]
        .call(pluginContext, document, aggregatedOptions));
    }
    return promise;
  }, Promise.resolve());
  methodName = toCamelCase(`load-${phase}`);
  if (options[methodName]) {
    await options[methodName].call(pluginContext, document, options);
  }
  methodName = toCamelCase(`post-${phase}`);
  await pluginsList.reduce((promise, plugin) => {
    const aggregatedOptions = { ...options, ...plugin.options };
    if (plugin[methodName]) {
      return promise.then(() => plugin[methodName]
        .call(pluginContext, document, aggregatedOptions));
    }
    return promise;
  }, Promise.resolve());
}

/**
 * The main loading logic for the page.
 * It defines the 3 phases (eager, lazy, delayed), and registers both
 * plugins and project hooks.
 *
 * @param {object} options
 * @returns
 */
async function loadPage(options = {}) {
  const pluginsList = Object.values(plugins);

  await execPhase(pluginsList, 'eager', options);

  await waitForLCP(options.lcpBlocks || []);

  const main = document.querySelector('main');
  await loadBlocks(main);

  await execPhase(pluginsList, 'lazy', options);
  return new Promise((resolve) => {
    window.setTimeout(async () => {
      await execPhase(pluginsList, 'delayed', options);
      resolve();
    }, options.delayedDuration || 3000);
  });
}

/*
 * Setup block utils.
 */
export function setup() {
  window.hlx = window.hlx || {};
  window.hlx.RUM_MASK_URL = 'full';
  window.hlx.codeBasePath = '';
  window.hlx.context = pluginContext;
  window.hlx.lighthouse = new URLSearchParams(window.location.search).get('lighthouse') === 'on';

  const scriptEl = document.querySelector('script[src$="/scripts/scripts.js"]');
  if (scriptEl) {
    try {
      [window.hlx.codeBasePath] = new URL(scriptEl.src).pathname.split('/scripts/scripts.js');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  }
}
setup();

// Register core plugins
withPlugin(RumPlugin);
withPlugin(DecoratorPlugin);
await withPlugin(`${window.hlx.codeBasePath}/tools/preview/preview.js`, {
  condition: () => window.location.hostname.endsWith('hlx.page')
    || window.location.hostname === 'localhost',
});

/**
 * Init the page load
 *
 * @param {object} options The options for the page load
 */
export async function init(options) {
  return loadPage(options);
}
