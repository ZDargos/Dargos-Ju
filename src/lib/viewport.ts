// Keeps a full-screen game pinned to the part of the screen you can actually see. When the phone
// keyboard opens, iPhones shrink the visible area and scroll the page to show the text box, which
// pushes the top of the game (lives, the word, the clock) off screen. While pinned, the game fills
// exactly the visible area above the keyboard and the page itself can't scroll.

import { useEffect } from 'react';

export function usePinnedToViewport(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const update = () => {
      root.style.setProperty('--vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
      root.style.setProperty('--vvt', `${Math.round(vv ? vv.offsetTop : 0)}px`);
      // Little room left (keyboard open on a phone): the game drops its extras.
      root.classList.toggle('kbd-tight', (vv ? vv.height : window.innerHeight) < 540);
    };
    update();
    root.classList.add('kbd-pin');
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      root.classList.remove('kbd-pin', 'kbd-tight');
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);
}
