import {
  loadBlock,
  toCamelCase,
  loadPage,
} from './lib-franklin.js';

document.addEventListener('htmx:afterRequest', (ev) => {
  if (ev.target.classList.contains('block')) {
    loadBlock(ev.target);
  }
});

loadPage({
  loadEager: () => {
    document.querySelectorAll('main>div').forEach((section, i) => {
      section.classList.add('section');
      let defaultBlock;
      [...section.children].forEach((block, j) => {
        if (block.nodeName !== 'DIV' && !defaultBlock) {
          defaultBlock = document.createElement('div');
          if (!i && !j) {
            defaultBlock.classList.add('hero');
          } else {
            defaultBlock.classList.add('default');
          }
          defaultBlock.classList.add('block');
          [defaultBlock.dataset.blockName] = defaultBlock.classList;
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

        [block.dataset.blockName] = block.classList;
        block.classList.add('block');

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
    document.querySelectorAll('body .block.hero').forEach(loadBlock);
  },
  loadLazy: () => {
    const header = document.querySelector('body>header');
    header.classList.add('header');
    header.classList.add('block');
    header.dataset.blockName = 'header';
    header.dataset.hxGet = '/nav.plain.html';
    header.dataset.hxTrigger = 'load';
    htmx.process(header);

    const footer = document.querySelector('body>footer');
    footer.classList.add('footer');
    footer.classList.add('block');
    footer.dataset.blockName = 'footer';
    footer.dataset.hxGet = '/footer.plain.html';
    footer.dataset.hxTrigger = 'load';
    htmx.process(footer);

    document.querySelectorAll('main a:only-child').forEach((button) => {
      button.classList.add('button');
      if (button.parentElement.nodeName === 'EM') {
        button.classList.add('secondary');
        button.parentElement.replaceWith(button);
      }
    });

    document.querySelectorAll('main .block:not(.default):not(.htmx-request)').forEach(loadBlock);
  },
  loadDelayed: () => {},
});
