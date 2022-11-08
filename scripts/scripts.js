import {
  decorateBlock,
  loadBlock,
  loadPage,
} from './lib-franklin.js';

loadPage({
  lcpBlocks: ['hero'],
  loadEager: () => {
    const hero = document.querySelector('.section .block');
    decorateBlock(hero, 'hero');
  },
  loadLazy: () => {
    const header = document.querySelector('body>header');
    decorateBlock(header, 'header');
    loadBlock(header, '/nav.plain.html');

    const footer = document.querySelector('body>footer');
    decorateBlock(footer, 'footer');
    loadBlock(footer, '/footer.plain.html');

    document.querySelectorAll('main a:only-child').forEach((button) => {
      button.classList.add('button');
      if (button.parentElement.nodeName === 'STRONG') {
        button.classList.add('cta');
        button.parentElement.replaceWith(button);
      } else if (button.parentElement.nodeName === 'EM') {
        button.classList.add('secondary');
        button.parentElement.replaceWith(button);
      }
    });
  },
  loadDelayed: () => {},
});
