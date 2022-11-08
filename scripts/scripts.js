import {
  loadBlock,
  loadPage,
} from './lib-franklin.js';

loadPage({
  lcpBlocks: ['hero'],
  loadLazy: () => {
    const header = document.querySelector('body>header');
    header.classList.add('header');
    loadBlock(header, '/nav.plain.html');

    const footer = document.querySelector('body>footer');
    footer.classList.add('footer');
    loadBlock(footer, '/footer.plain.html');

    document.querySelectorAll('main a:only-child').forEach((button) => {
      button.classList.add('button');
      if (button.parentElement.nodeName === 'EM') {
        button.classList.add('secondary');
        button.parentElement.replaceWith(button);
      }
    });
  },
  loadDelayed: () => {},
});
