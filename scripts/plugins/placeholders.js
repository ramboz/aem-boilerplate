import {
  toCamelCase,
} from '../lib-franklin.js';

let placeholders = {};

/**
 * Gets placeholders object
 * @param {string} prefix
 */
async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  const loaded = window.placeholders[`${prefix}-loaded`];
  if (!loaded) {
    window.placeholders[`${prefix}-loaded`] = new Promise((resolve, reject) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          throw new Error(`${resp.status}: ${resp.statusText}`);
        }).then((json) => {
          placeholders = json.data
            .filter((placeholder) => placeholder.Key)
            .reduce((results, placeholder) => {
              results[toCamelCase(placeholder.Key)] = placeholder.Text;
              return results;
            }, {});
          window.placeholders[prefix] = placeholders;
          resolve();
        }).catch((error) => {
          // error loading placeholders
          window.placeholders[prefix] = {};
          reject(error);
        });
    });
  }
  await window.placeholders[`${prefix}-loaded`];
  return window.placeholders[prefix];
}

/**
 * Gets the list of placeholders.
 */
function getPlaceholders() {
  return placeholders;
}

/**
 * The plugin API
 */
export const api = {
  getPlaceholders,
};

/**
 * Logic to execute in the pre lazy phase
 */
export async function preLazy(doc, options) {
  try {
    placeholders = await fetchPlaceholders(options.prefix);
  } catch (err) {
    placeholders = {};
  }
}
