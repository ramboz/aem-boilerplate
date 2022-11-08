htmx.config.includeIndicatorStyles = false;

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

export async function loadBlock(block) {
  block.dataset.isLoading = true;
  const { blockName, hxGet, hxTrigger } = block.dataset;
  const contentLoaded = hxGet
    ? new Promise((resolve) => {
      if (!hxTrigger) {
        block.dataset.hxTrigger = 'load';
      }
      block.addEventListener('htmx:afterRequest', () => resolve(), { once: true });
      htmx.process(block);
    })
    : Promise.resolve();
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

document.addEventListener('htmx:afterRequest', (ev) => {
  if (ev.target.classList.contains('block') && ev.target.dataset.isLoading) {
    loadBlock(ev.target);
  }
});

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

/**
 * load LCP block and/or wait for LCP in default content.
 */
async function waitForLCP(lcpBlocks) {
  const block = document.querySelector('.block');
  const hasLCPBlock = (block && lcpBlocks.includes(block.getAttribute('data-block-name')));
  if (hasLCPBlock) await loadBlock(block);

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
 * The main loading logic for the page.
 * It defines the 3 phases (eager, lazy, delayed), and registers both
 * plugins and project hooks.
 *
 * @param {object} options
 * @returns
 */
export async function loadPage(options = {}) {
  const { lcpBlocks = [] } = options;
  const lcpCandidate = document.querySelector('main img');
  lcpCandidate.fetchPriority = 'high';

  if (options.loadEager) {
    await options.loadEager(document, options);
  }

  await waitForLCP(lcpBlocks);
  document.querySelector('body').classList.add('appear');

  const main = document.querySelector('main');
  // await loadBlocks(main);

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
