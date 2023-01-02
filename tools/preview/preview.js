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

export const DEFAULT_OPTIONS = {
  overlayClass: 'hlx-preview-overlay',
};

function createPreviewOverlay(cls) {
  const overlay = document.createElement('div');
  overlay.className = cls;
  return overlay;
}

function createButton(label) {
  const button = document.createElement('button');
  button.className = 'hlx-badge';
  const text = document.createElement('span');
  text.innerHTML = label;
  button.append(text);
  return button;
}

function createPopupItem(item) {
  const actions = item.actions.map((action) => `<div class="hlx-button"><a href="${action.href}">${action.label}</a></div>`);
  const div = document.createElement('div');
  div.className = `hlx-popup-item${item.isSelected ? ' is-selected' : ''}`;
  div.innerHTML = `
    <h5 class="hlx-popup-item-label">${item.label}</h5>
    <div class="hlx-popup-item-description">${item.description}</div>
    <div class="hlx-popup-item-actions">${actions}</div>`;
  return div;
}

function createPopupDialog(header, items = []) {
  const actions = header.actions.map((action) => `<div class="hlx-button"><a href="${action.href}">${action.label}</a></div>`);
  const popup = document.createElement('div');
  popup.className = 'hlx-popup hlx-hidden';
  popup.innerHTML = `
    <div class="hlx-popup-header">
      <h5 class="hlx-popup-header-label">${header.label}</h5>
      <div class="hlx-popup-header-description">${header.description}</div>
      <div class="hlx-popup-header-actions">${actions}</div>
    </div>
    <div class="hlx-popup-items"></div>`;
  const list = popup.querySelector('.hlx-popup-items');
  items.forEach((item) => {
    list.append(createPopupItem(item));
  });
  return popup;
}

function createPopupButton(label, header, items) {
  const button = createButton(label);
  const popup = createPopupDialog(header, items);
  button.innerHTML += '<span class="hlx-open"></span>';
  button.append(popup);
  button.addEventListener('click', () => {
    popup.classList.toggle('hlx-hidden');
  });
  return button;
}

function getOverlay(options) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  return document.querySelector(`.${config.overlayClass}`);
}

export const api = {
  createPopupButton,
  getOverlay,
};

/**
 * Decorates Preview mode badges and overlays
 * @return {Object} returns a badge or empty string
 */
export async function preLazy(doc, options) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  this.loadCSS(`${config.basePath}/preview.css`);

  try {
    let overlay = getOverlay(options);
    if (!overlay) {
      overlay = createPreviewOverlay(config.overlayClass);
      document.body.append(overlay);
    }
  } catch (err) {
    console.log(err);
  }
}
