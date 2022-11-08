/**
 * Sanitizes a name for use as class name.
 * @param {string} name The unsanitized name
 * @returns {string} The class name
 */
export function toClassName(name) {
  return typeof name === 'string'
    ? name.toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : '';
}

/*
 * Sanitizes a name for use as a js property name.
 * @param {string} name The unsanitized name
 * @returns {string} The camelCased name
 */
export function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

export function loadCSS(href, callback) {
  if (!document.querySelector(`head > link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    if (typeof callback === 'function') {
      link.onload = (e) => callback(e.type);
      link.onerror = (e) => callback(e.type);
    }
    document.head.appendChild(link);
  } else if (typeof callback === 'function') {
    callback('noop');
  }
}

export async function loadContent(path, element) {
  try {
    const resp = await fetch(path);
    if (!resp.ok) {
      console.log('error loading experiment content:', resp);
      return null;
    }
    const html = await resp.text();
    element.innerHTML = html;
  } catch (e) {
    console.log(`error loading experiment content: ${path}`, e);
  }
  return null;
}

export async function loadBlock(block, contentUrl) {
  block.dataset.isLoading = true;
  const { blockName = block.classList[0] } = block.dataset;
  const contentLoaded = contentUrl ? loadContent(contentUrl, block) : Promise.resolve();
  try {
    const cssLoaded = new Promise((resolve) => {
      loadCSS(`/blocks/${blockName}/${blockName}.css`, resolve);
    });
    const jsLoaded = import(`/blocks/${blockName}/${blockName}.js`);
    await Promise.all([jsLoaded, cssLoaded, contentLoaded])
      .then(([mod]) => {
        try {
          (async () => {
            if (mod.default) {
              await mod.default(block);
            }
          })();
        } catch (error) {
          console.log(`failed to load module for ${blockName}`, error);
        }
      })
      .catch();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`failed to load block ${blockName}`, error);
  }
  delete block.dataset.isLoading;
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {boolean} eager load image eager
 * @param {Array} breakpoints breakpoints and corresponding params (eg. width)
 */
export function createOptimizedPicture(src, alt = '', eager = false, breakpoints = [{ media: '(min-width: 400px)', width: '2000' }, { width: '750' }]) {
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

export function decorateBlock(block, blockName) {
  block.dataset.blockName = blockName || block.classList[0];
  block.classList.add('block');
  block.classList.add(block.dataset.blockName);
  if (blockName && blockName !== 'default') {
    block.classList.remove('default');
  }
}

function decorateSections() {
  document.querySelectorAll('main>div').forEach((section) => {
    section.classList.add('section');
    let defaultBlock;
    [...section.children].forEach((block) => {
      if (block.nodeName !== 'DIV' && !defaultBlock) {
        defaultBlock = document.createElement('div');
        defaultBlock.classList.add('default');
        decorateBlock(defaultBlock);
        section.insertBefore(defaultBlock, block);
        defaultBlock.append(block);
        return;
      }
      if (block.nodeName !== 'DIV') {
        defaultBlock.append(block);
        return;
      }

      if (defaultBlock) {
        defaultBlock = null;
      }

      decorateBlock(block);

      /* process section metadata */
      if (block.dataset.blockName === 'section-metadata') {
        [...block.children].forEach((child) => {
          const prop = toCamelCase(child.children[0].innerText);
          const value = child.children[1].innerText;
          if (prop === 'style') {
            section.classList.add(value);
          } else {
            section.dataset[prop] = value;
          }
        });
        block.remove();
      }
    });
  });
}

/**
 * load LCP block and/or wait for LCP in default content.
 */
async function waitForLCP(lcpBlocks) {
  const lcpCandidate = document.querySelector('main img');
  const lcpLoadedLoaded = new Promise((resolve) => {
    if (lcpCandidate && !lcpCandidate.complete) {
      lcpCandidate.setAttribute('loading', 'eager');
      lcpCandidate.addEventListener('load', resolve);
      lcpCandidate.addEventListener('error', resolve);
    } else {
      resolve();
    }
  });

  const block = document.querySelector('.block');
  const isLcpBlock = (block && lcpBlocks.includes(block.dataset.blockName));
  const lcpBlockLoaded = isLcpBlock ? loadBlock(block) : Promise.resolve();

  await Promise.all([lcpLoadedLoaded, lcpBlockLoaded]);
}

/**
 * The main loading logic for the page.
 * It defines the 3 phases (eager, lazy, delayed), and registers both
 * plugins and project hooks.
 *
 * @param {object} options
 * @returns
 */
export async function init(options = {}) {
  if (options.withCwv && (window.location.hostname === 'localhost' || window.location.hostname.endsWith('.hlx.page'))) {
    const { trackAll } = await import('./lib-perf.js');
    trackAll();
  }
  const { lcpBlocks = [] } = options;
  const lcpCandidate = document.querySelector('main img');
  if (lcpCandidate) {
    lcpCandidate.fetchPriority = 'high';
  }

  decorateSections();

  if (options.loadEager) {
    await options.loadEager(document, options);
  }

  await waitForLCP(lcpBlocks);
  document.querySelector('body').classList.add('appear');

  const main = document.querySelector('main');
  const blocks = [...main.querySelectorAll('.block:not(.default)')];
  for (let i = 0; i < blocks.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(blocks[i]);
  }

  if (options.loadLazy) {
    await options.loadLazy(document, options);
  }

  return new Promise((resolve) => {
    window.setTimeout(async () => {
      if (options.loadDelayed) {
        await options.loadDelayed(document, options);
      }
      resolve();
    }, options.delayedDuration || 3000);
  });
}
