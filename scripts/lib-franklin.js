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

function murmurhash3_32_gc(key, seed) {
  var remainder = key.length & 3;
  var bytes = key.length - remainder;
  var c1 = 0xcc9e2d51;
  var c2 = 0x1b873593;
  var h1 = seed;
  var k1;
  var h1b;
  var i = 0;
  while (i < bytes) {
      k1 =
          ((key.charCodeAt(i) & 0xff)) |
              ((key.charCodeAt(++i) & 0xff) << 8) |
              ((key.charCodeAt(++i) & 0xff) << 16) |
              ((key.charCodeAt(++i) & 0xff) << 24);
      ++i;
      k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;
      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
      h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
  }
  k1 = 0;
  switch (remainder) {
      case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
      case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
      case 1:
          k1 ^= (key.charCodeAt(i) & 0xff);
          k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
          k1 = (k1 << 15) | (k1 >>> 17);
          k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
          h1 ^= k1;
  }
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

var TOTAL_BUCKETS = 10000;
function getBucket(saltedId) {
  var hash = murmurhash3_32_gc(saltedId, 0);
  var hashFixedBucket = Math.abs(hash) % TOTAL_BUCKETS;
  var bucket = hashFixedBucket / TOTAL_BUCKETS;
  return bucket;
}
function pickWithWeightsBucket(allocationPercentages, treatments, bucket) {
  var sum = allocationPercentages.reduce(function (partialSum, a) { return partialSum + a; }, 0);
  var partialSum = 0.0;
  for (var i = 0; i < treatments.length; i++) {
      partialSum += Number(allocationPercentages[i].toFixed(2)) / sum;
      if (bucket > partialSum) {
          continue;
      }
      return treatments[i];
  }
}
function assignTreatmentByVisitor(experimentid, identityId, allocationPercentages, treatments) {
  var saltedId = experimentid + '.' + identityId;
  var bucketId = getBucket(saltedId);
  var treatmentId = pickWithWeightsBucket(allocationPercentages, treatments, bucketId);
  return {
      treatmentId: treatmentId,
      bucketId: bucketId
  };
}

var LOCAL_STORAGE_KEY = 'unified-decisioning-experiments';
function assignTreatment(allocationPercentages, treatments) {
  var random = Math.random() * 100;
  var i = treatments.length;
  while (random > 0 && i > 0) {
      i -= 1;
      random -= +allocationPercentages[i];
  }
  return treatments[i];
}
function getLastExperimentTreatment(experimentId) {
  var experimentsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (experimentsStr) {
      var experiments = JSON.parse(experimentsStr);
      if (experiments[experimentId]) {
          return experiments[experimentId].treatment;
      }
  }
  return null;
}
function setLastExperimentTreatment(experimentId, treatment) {
  var experimentsStr = localStorage.getItem(LOCAL_STORAGE_KEY);
  var experiments = experimentsStr ? JSON.parse(experimentsStr) : {};
  var now = new Date();
  var expKeys = Object.keys(experiments);
  expKeys.forEach(function (key) {
      var date = new Date(experiments[key].date);
      if ((now.getTime() - date.getTime()) > (1000 * 86400 * 30)) {
          delete experiments[key];
      }
  });
  var date = now.toISOString().split('T')[0];
  experiments[experimentId] = { treatment: treatment, date: date };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(experiments));
}
function assignTreatmentByDevice(experimentId, allocationPercentages, treatments) {
  var cachedTreatmentId = getLastExperimentTreatment(experimentId);
  var treatmentIdResponse;
  if (!cachedTreatmentId) {
      var assignedTreatmentId = assignTreatment(allocationPercentages, treatments);
      setLastExperimentTreatment(experimentId, assignedTreatmentId);
      treatmentIdResponse = assignedTreatmentId;
  }
  else {
      treatmentIdResponse = cachedTreatmentId;
  }
  return {
      treatmentId: treatmentIdResponse
  };
}

var RandomizationUnit = {
  VISITOR: 'VISITOR',
  DEVICE: 'DEVICE'
};
function evaluateExperiment(context, experiment) {
  var experimentId = experiment.id, identityNamespace = experiment.identityNamespace, _a = experiment.randomizationUnit, randomizationUnit = _a === void 0 ? RandomizationUnit.VISITOR : _a;
  var identityMap = context.identityMap;
  var treatments = experiment.treatments.map(function (item) { return item.id; });
  var allocationPercentages = experiment.treatments.map(function (item) { return item.allocationPercentage; });
  var treatmentAssignment = null;
  switch (randomizationUnit) {
      case RandomizationUnit.VISITOR: {
          var identityId = identityMap[identityNamespace][0].id;
          treatmentAssignment = assignTreatmentByVisitor(experimentId, identityId, allocationPercentages, treatments);
          break;
      }
      case RandomizationUnit.DEVICE: {
          treatmentAssignment = assignTreatmentByDevice(experimentId, allocationPercentages, treatments);
          break;
      }
      default:
          throw new Error("Unknow randomization unit");
  }
  var evaluationResponse = {
      experimentId: experimentId,
      hashedBucket: treatmentAssignment.bucketId,
      treatment: {
          id: treatmentAssignment.treatmentId
      }
  };
  return evaluationResponse;
}

function traverseDecisionTree(decisionNodesMap, context, currentNodeId) {
  var _a = decisionNodesMap[currentNodeId], experiment = _a.experiment, type = _a.type;
  if (type === 'EXPERIMENTATION') {
      var treatment = evaluateExperiment(context, experiment).treatment;
      return [treatment];
  }
}
function evaluateDecisionPolicy(decisionPolicy, context) {
  var decisionNodesMap = {};
  decisionPolicy.decisionNodes.forEach(function (item) {
      decisionNodesMap[item['id']] = item;
  });
  var items = traverseDecisionTree(decisionNodesMap, context, decisionPolicy.rootDecisionNodeId);
  return {
      items: items
  };
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

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
export function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope>div').forEach((row) => {
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
        // eslint-disable-next-line object-curly-newline
        window.hlx.rum = { weight, id, random, isSelected, sampleRUM };
      }
      const { weight, id } = window.hlx.rum;
      if (window.hlx && window.hlx.rum && window.hlx.rum.isSelected) {
        const sendPing = (pdata = data) => {
          // eslint-disable-next-line object-curly-newline, max-len, no-use-before-define
          const body = JSON.stringify({ weight, id, referer: window.location.href, generation: window.hlx.RUM_GENERATION, checkpoint, ...data });
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

export const DecoratorPlugin = () => {
  /**
   * Replace icons with inline SVG and prefix with codeBasePath.
   * @param {Element} element
   */
  function decorateIcons(element = document) {
    element.querySelectorAll('span.icon').forEach(async (span) => {
      if (span.classList.length < 2 || !span.classList[1].startsWith('icon-')) {
        return;
      }
      const icon = span.classList[1].substring(5);
      // eslint-disable-next-line no-use-before-define
      const resp = await fetch(`${window.hlx.codeBasePath}/icons/${icon}.svg`);
      if (resp.ok) {
        const iconHTML = await resp.text();
        if (iconHTML.match(/<style/i)) {
          const img = document.createElement('img');
          img.src = `data:image/svg+xml,${encodeURIComponent(iconHTML)}`;
          span.appendChild(img);
        } else {
          span.innerHTML = iconHTML;
        }
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
      block.setAttribute('data-block-name', shortBlockName);
      block.setAttribute('data-block-status', 'initialized');
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
      section.setAttribute('data-section-status', 'initialized');

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
    const addClasses = (elem, classes) => {
      classes.split(',').forEach((v) => {
        elem.classList.add(toClassName(v.trim()));
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
      decorateButtons,
      decorateIcons,
    },

    preEager: async () => {
      decorateTemplateAndTheme();
    },

    postEager: async () => {
      const main = document.querySelector('main');
      decorateSections(main);
      decorateBlocks(main);
    },
  };
};

export const ExperimentationPlugin = () => {
  const DEFAULT_OPTIONS = {
    basePath: '/experiments',
    configFile: 'manifest.json',
    metaTag: 'experiment',
    queryParameter: 'experiment',
    storeKey: 'hlx-experiments',
  };

  /**
   * Parses the experimentation configuration sheet and creates an internal model.
   *
   * Output model is expected to have the following structure:
   *      {
   *        label: <string>,
   *        blocks: [<string>]
   *        audience: Desktop | Mobile,
   *        status: Active | On | True | Yes,
   *        variantNames: [<string>],
   *        variants: {
   *          [variantName]: {
   *            label: <string>
   *            percentageSplit: <number 0-1>,
   *            content: <string>,
   *            code: <string>,
   *          }
   *        }
   *      };
   */
  function parseExperimentConfig(json) {
    const config = {};
    try {
      json.settings.data.forEach((row) => {
        const prop = toCamelCase(row.Name);
        if (['audience', 'status'].includes(prop)) {
          config[prop] = row.Value;
        } else if (prop === 'experimentName') {
          config.label = row.Value;
        } else if (prop === 'blocks') {
          config[prop] = row.Value.split(/[,\n]/);
        }
      });

      config.variantNames = [];
      config.variants = {};
      json.variants.data.forEach((row) => {
        const {
          Name, Label, Split, Pages, Blocks,
        } = row;
        const variantName = toCamelCase(Name);
        config.variantNames.push(variantName);
        config.variants[variantName] = {
          label: Label,
          percentageSplit: Split,
          content: Pages ? Pages.trim().split(',') : [],
          code: Blocks ? Blocks.trim().split(',') : [],
        };
      });
      return config;
    } catch (e) {
      console.log('error parsing experiment config:', e);
    }
    return null;
  }

  /**
   * Gets the experiment name, if any for the page based on env, useragent, queyr params
   * @returns {string} experimentid
   */
  function getExperiment(tagName) {
    if (navigator.userAgent.match(/bot|crawl|spider/i)) {
      return null;
    }

    return toClassName(getMetadata(tagName)) || null;
  }

  function validateConfig(config) {
    if (!config.variantNames
      || !config.variants
      || !Object.values(config.variants).every((v) => (
        typeof v === 'object'
        && !!v.code
        && !!v.content
        && (v.percentageSplit === '' || !!v.percentageSplit)
      ))) {
      throw new Error('Invalid experiment config. Please review your sheet and parser.');
    }
  }

  /**
   * Gets experiment config from the manifest and transforms it to more easily
   * consumable structure.
   *
   * the manifest consists of two sheets "settings" and "experiences", by default
   *
   * "settings" is applicable to the entire test and contains information
   * like "Audience", "Status" or "Blocks".
   *
   * "experience" hosts the experiences in rows, consisting of:
   * a "Percentage Split", "Label" and a set of "Links".
   *
   *
   * @param {string} experimentId
   * @param {object} cfg
   * @returns {object} containing the experiment manifest
   */
  async function getExperimentConfig(experimentId, cfg) {
    const path = `${cfg.basePath}/${experimentId}/${cfg.configFile}`;
    try {
      const resp = await fetch(path);
      if (!resp.ok) {
        console.log('error loading experiment config:', resp);
        return null;
      }
      const json = await resp.json();
      const config = cfg.parser ? cfg.parser(json) : parseExperimentConfig(json);
      validateConfig(config);
      config.id = experimentId;
      config.manifest = path;
      config.basePath = `${cfg.basePath}/${experimentId}`;
      return config;
    } catch (e) {
      console.log(`error loading experiment manifest: ${path}`, e);
    }
    return null;
  }

  function getDecisionPolicy(config) {
    const decisionPolicy = {
      id: 'content-experimentation-policy',
      rootDecisionNodeId: 'n1',
      decisionNodes: [{
        id: 'n1',
        type: 'EXPERIMENTATION',
        experiment: {
          id: config.id,
          identityNamespace: 'ECID',
          randomizationUnit: 'DEVICE',
          treatments: Object.entries(config.variants).map(([key, props]) => ({
            id: key,
            allocationPercentage: props.percentageSplit
              ? parseFloat(props.percentageSplit) * 100
              : 100 - Object.values(config.variants).reduce((result, variant) => {
                result -= parseFloat(variant.percentageSplit || 0) * 100;
                return result;
              }, 100),
          })),
        },
      }],
    };
    return decisionPolicy;
  }

  /**
   * this is an extensible stub to take on audience mappings
   * @param {string} audience
   * @return {boolean} is member of this audience
   */
  function isValidAudience(audience) {
    if (audience === 'mobile') {
      return window.innerWidth < 600;
    }
    if (audience === 'desktop') {
      return window.innerWidth >= 600;
    }
    return true;
  }

  /**
   * Replaces element with content from path
   * @param {string} path
   * @param {HTMLElement} element
   * @param {boolean} isBlock
   */
  async function replaceInner(path, element, isBlock = false) {
    const plainPath = `${path}.plain.html`;
    try {
      const resp = await fetch(plainPath);
      if (!resp.ok) {
        console.log('error loading experiment content:', resp);
        return null;
      }
      const html = await resp.text();
      if (isBlock) {
        const div = document.createElement('div');
        div.innerHTML = html;
        element.replaceWith(div.children[0].children[0]);
      } else {
        element.innerHTML = html;
      }
    } catch (e) {
      console.log(`error loading experiment content: ${plainPath}`, e);
    }
    return null;
  }

  async function runExperiment(config, plugins) {
    const experiment = getExperiment(config.metaTag);
    if (!experiment) {
      return;
    }

    const usp = new URLSearchParams(window.location.search);
    const [forcedExperiment, forcedVariant] = usp.has(config.queryParameter) ? usp.get(config.queryParameter).split('/') : [];

    const experimentConfig = await getExperimentConfig(experiment, config);
    console.debug(experimentConfig);
    if (!experimentConfig || (toCamelCase(experimentConfig.status) !== 'active' && !forcedExperiment)) {
      return;
    }

    experimentConfig.run = forcedExperiment
      || isValidAudience(toClassName(experimentConfig.audience));
    window.hlx = window.hlx || {};
    window.hlx.experiment = experimentConfig;
    console.debug('run', experimentConfig.run, experimentConfig.audience);
    if (!experimentConfig.run) {
      return;
    }

    if (forcedVariant && experimentConfig.variantNames.includes(forcedVariant)) {
      experimentConfig.selectedVariant = forcedVariant;
    } else {
      const decision = evaluateDecisionPolicy(getDecisionPolicy(experimentConfig), {});
      experimentConfig.selectedVariant = decision.items[0].id;
    }

    if (plugins.rum) {
      plugins.rum.sampleRUM('experiment', { source: experimentConfig.id, target: experimentConfig.selectedVariant });
    }
    console.debug(`running experiment (${window.hlx.experiment.id}) -> ${window.hlx.experiment.selectedVariant}`);

    if (experimentConfig.selectedVariant === experimentConfig.variantNames[0]) {
      return;
    }

    const currentPath = window.location.pathname;
    const { content } = experimentConfig.variants[experimentConfig.selectedVariant];
    if (!content.length) {
      return;
    }

    const control = experimentConfig.variants[experimentConfig.variantNames[0]];
    const index = control.content.indexOf(currentPath);
    if (index < 0 || content[index] === currentPath) {
      return;
    }

    // Fullpage content experiment
    await replaceInner(content[0], document.querySelector('main'));
  }

  return {
    name: 'experimentation',

    patchBlockConfig: (config) => {
      const { experiment } = window.hlx;

      // No experiment is running
      if (!experiment || !experiment.run) {
        return config;
      }

      // The current experiment does not modify the block
      if (experiment.selectedVariant === experiment.variantNames[0]
        || !experiment.blocks || !experiment.blocks.includes(config.blockName)) {
        return config;
      }

      // The current experiment does not modify the block code
      const variant = experiment.variants[experiment.selectedVariant];
      if (!variant.code.length) {
        return config;
      }

      let index = experiment.variants[experiment.variantNames[0]].code.indexOf('');
      if (index < 0) {
        index = experiment.variants[experiment.variantNames[0]].code.indexOf(config.blockName);
      }
      if (index < 0) {
        index = experiment.variants[experiment.variantNames[0]].code.indexOf(`/blocks/${config.blockName}`);
      }
      if (index < 0) {
        return config;
      }

      let origin = '';
      let path;
      if (/^https?:\/\//.test(variant.code[index])) {
        const url = new URL(variant.code[index]);
        // Experimenting from a different branch
        if (url.origin !== window.location.origin) {
          origin = url.origin;
        }
        // Experimenting from a block path
        if (url.pathname !== '/') {
          path = url.pathname;
        } else {
          path = `/blocks/${config.blockName}`;
        }
      } else { // Experimenting from a different branch on the same branch
        path = variant.code[index];
      }
      if (!origin && !path) {
        return config;
      }

      const { codeBasePath } = window.hlx;
      return {
        ...config,
        cssPath: `${origin}${codeBasePath}${path}/${config.blockName}.css`,
        jsPath: `${origin}${codeBasePath}${path}/${config.blockName}.js`,
      };
    },

    preEager: async (customOptions, plugins) => {
      const options = {
        ...DEFAULT_OPTIONS,
        ...customOptions,
      };
      await runExperiment(options, plugins);

      !function(n,o){o.forEach(function(o){n[o]||((n.__alloyNS=n.__alloyNS||
      []).push(o),n[o]=function(){var u=arguments;return new Promise(
      function(i,l){n[o].q.push([i,l,u])})},n[o].q=[])})}
      (window,["alloy"]);
    },

    preLazy: async () => {
      import('./plugins/experimentation-ued/alloy.min.js');
      if (window.location.hostname.endsWith('hlx.page') || window.location.hostname === ('localhost')) {
        // eslint-disable-next-line import/no-cycle
        import('./plugins/experimentation-ued/preview.js');
      }
    },
  };
}

/**
 * Loads a CSS file.
 * @param {string} href The path to the CSS file
 */
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

const pluginReferences = {};
const pluginsApis = {};
export async function withPlugin(pathOrFunction, options = {}) {
  let plugin;
  let pluginName;
  if (typeof pathOrFunction === 'string') {
    const tokens = pathOrFunction.split('/');
    pluginName = toCamelCase(tokens.pop().replace('.js', ''));
    if (pluginName === 'index') {
      pluginName = toCamelCase(tokens.pop());
    }
    plugin = await import(pathOrFunction);
  } else if (typeof pathOrFunction === 'function') {
    plugin = pathOrFunction(options);
    pluginName = plugin.name || pathOrFunction.name;
  } else {
    throw new Error('Invalid plugin reference', pathOrFunction);
  }
  pluginReferences[pluginName] = { ...plugin, options };
  if (plugin.api) {
    pluginsApis[pluginName] = plugin.api;
  }
  return plugin.api || null;
}

export const plugins = pluginsApis;

/**
 * Builds a block DOM Element from a two dimensional array
 * @param {string} blockName name of the block
 * @param {any} content two dimensional array or string or object of content
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
 * Normalizes all headings within a container element.
 * @param {Element} el The container element
 * @param {[string]} allowedHeadings The list of allowed headings (h1 ... h6)
 */
export function normalizeHeadings(el, allowedHeadings) {
  const allowed = allowedHeadings.map((h) => h.toLowerCase());
  el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((tag) => {
    const h = tag.tagName.toLowerCase();
    if (allowed.indexOf(h) === -1) {
      // current heading is not in the allowed list -> try first to "promote" the heading
      let level = parseInt(h.charAt(1), 10) - 1;
      while (allowed.indexOf(`h${level}`) === -1 && level > 0) {
        level -= 1;
      }
      if (level === 0) {
        // did not find a match -> try to "downgrade" the heading
        while (allowed.indexOf(`h${level}`) === -1 && level < 7) {
          level += 1;
        }
      }
      if (level !== 7) {
        tag.outerHTML = `<h${level} id="${tag.id}">${tag.textContent}</h${level}>`;
      }
    }
  });
}

/**
 * Updates all section status in a container element.
 * @param {Element} main The container element
 */
export function updateSectionsStatus(main) {
  const sections = [...main.querySelectorAll(':scope>div')];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const status = section.getAttribute('data-section-status');
    if (status !== 'loaded') {
      const loadingBlock = section.querySelector('.block[data-block-status="initialized"], .block[data-block-status="loading"]');
      if (loadingBlock) {
        section.setAttribute('data-section-status', 'loading');
        break;
      } else {
        section.setAttribute('data-section-status', 'loaded');
      }
    }
  }
}

/**
 * Gets the configuration for the given glock, and also passes
 * the config to the `patchBlockConfig` methods in the plugins.
 *
 * @param {Element} block The block element
 * @returns {object} The block config (blockName, cssPath and jsPath)
 */
function getBlockConfig(block) {
  const blockName = block.getAttribute('data-block-name');
  const cssPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`;
  const jsPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`;

  return Object.values(pluginReferences).reduce((config, plugin) => (
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
  const status = block.getAttribute('data-block-status');
  if (status === 'loading' || status === 'loaded') {
    return;
  }
  block.setAttribute('data-block-status', 'loading');
  const { blockName, cssPath, jsPath } = getBlockConfig(block);
  try {
    const cssLoaded = new Promise((resolve) => {
      loadCSS(cssPath, resolve);
    });
    const decorationComplete = new Promise((resolve) => {
      (async () => {
        try {
          const mod = await import(jsPath);
          if (mod.default) {
            await mod.default(block, pluginsApis);
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
  block.setAttribute('data-block-status', 'loaded');
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
 * load LCP block and/or wait for LCP in default content.
 */
export async function waitForLCP(lcpBlocks) {
  const block = document.querySelector('.block');
  const hasLCPBlock = (block && lcpBlocks.includes(block.getAttribute('data-block-name')));
  if (hasLCPBlock) await loadBlock(block);

  document.querySelector('body').classList.add('appear');
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
  const pluginsList = Object.values(pluginReferences);

  await Promise.all(pluginsList.map((p) => p.preEager
    && p.preEager.call(null, p.options, pluginsApis)));
  if (options.loadEager) {
    await options.loadEager(document, options);
  }
  await Promise.all(pluginsList.map((p) => p.postEager
    && p.postEager.call(null, p.options, pluginsApis)));

  await waitForLCP(options.lcpBlocks || []);

  const main = document.querySelector('main');
  await loadBlocks(main);

  await Promise.all(pluginsList.map((p) => p.preLazy
    && p.preLazy.call(null, p.options, pluginsApis)));
  if (options.loadLazy) {
    await options.loadLazy(document, options);
  }
  await Promise.all(pluginsList.map((p) => p.postLazy
    && p.postLazy.call(null, p.options, pluginsApis)));

  return new Promise((resolve) => {
    window.setTimeout(async () => {
      await Promise.all(pluginsList.map((p) => p.preDelayed
        && p.preDelayed.call(null, p.options, pluginsApis)));
      if (options.loadDelayed) {
        await options.loadDelayed(document, options);
      }
      await Promise.all(pluginsList.map((p) => p.postDelayed
        && p.postDelayed.call(null, p.options, pluginsApis)));
      resolve();
    }, options.delayedDuration || 3000);
  });
}

/**
 * init block utils
 */
window.hlx = window.hlx || {};
withPlugin(RumPlugin);
const {
  decorateBlock,
  decorateButtons,
  decorateIcons,
} = await withPlugin(DecoratorPlugin);

export async function init(options) {
  window.hlx.codeBasePath = '';

  const scriptEl = document.querySelector('script[src$="/scripts/scripts.js"]');
  if (scriptEl) {
    try {
      [window.hlx.codeBasePath] = new URL(scriptEl.src).pathname.split('/scripts/scripts.js');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  }

  return loadPage(options);
}

const LCP_BLOCKS = []; // add your LCP blocks to the list
window.hlx.RUM_GENERATION = 'project-1'; // add your RUM generation information here

await withPlugin(ExperimentationPlugin, {
  basePath: '/franklin-experiments',
  configFile: 'franklin-experiment.json',
  parser: (json) => {
    const config = {};
    try {
      const keyMap = {
        'Experiment Name': 'label',
      };
      Object.values(json.settings.data).reduce((cfg, entry) => {
        const key = keyMap[entry.Name] || toCamelCase(entry.Name);
        cfg[key] = key === 'blocks' ? entry.Value.split(/[,\n]/) : entry.Value;
        return cfg;
      }, config);

      config.variantNames = [];
      config.variants = {};
      json.variants.data.forEach((row) => {
        const {
          Name, Label, Split, Page, Block,
        } = row;
        const variantName = toCamelCase(Name);
        config.variantNames.push(variantName);
        config.variants[variantName] = {
          label: Label,
          percentageSplit: Split,
          content: Page ? Page.trim().split(',') : [],
          code: Block ? Block.trim().split(',') : [],
        };
      });
      return config;
    } catch (e) {
      console.log('error parsing experiment config:', e);
    }
    return null;
  },
});

function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
}

/**
 * loads everything needed to get to LCP.
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
  }
}

/**
 * Adds the favicon.
 * @param {string} href The favicon URL
 */
export function addFavIcon(href) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = href;
  const existingLink = document.querySelector('head link[rel="icon"]');
  if (existingLink) {
    existingLink.parentElement.replaceChild(link, existingLink);
  } else {
    document.getElementsByTagName('head')[0].appendChild(link);
  }
}

/**
 * loads a block named 'header' into header
 */

export function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
 * loads a block named 'footer' into footer
 */

export function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

/**
 * loads everything that doesn't need to be delayed.
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');

  const { hash } = window.location;
  const element = hash ? main.querySelector(hash) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  addFavIcon(`${window.hlx.codeBasePath}/styles/favicon.svg`);
}

/**
 * loads everything that happens a lot later, without impacting
 * the user experience.
 */
function loadDelayed() {
  // load anything that can be postponed to the latest here
  import('./delayed.js');
}

init({
  loadEager,
  loadLazy,
  loadDelayed,
  lcpblocks: LCP_BLOCKS,
});
