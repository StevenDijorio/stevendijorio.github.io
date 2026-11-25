const menu = document.querySelector('.mobile-menu');
const trigger = menu.querySelector('summary');

menu.addEventListener('click', event => {
  if (event.target.closest('a')) menu.open = false;
});

document.addEventListener('pointerdown', event => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    trigger.focus();
  }
});
