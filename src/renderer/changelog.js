/* changelog.js — per-version "What's new" content. The modal shows the entry
   for the version the app just updated to; add a new block per release. */
'use strict';

window.KRATE_CHANGELOG = {
  '1.2.0': {
    title: "What's new in Krate 1.2.0",
    items: [
      'Updates now show a sliding bar at the top instead of a popup, with an Update now button.',
      'This "What\'s new" screen appears once after every update.',
      'You can add several project folders. When you make a new project you pick which one it goes in.',
      'The graph view builds up piece by piece while loading, with a progress bar, instead of appearing all at once.',
      'Windows (like this one) can be dragged around by their title bar.',
    ],
  },
  '1.1.0': {
    title: "What's new in Krate 1.1.0",
    items: [
      'Graph view rebuilt: full folder depth, folders sized by content, yellow folders and white files.',
      'Right-click pins a node in place; pins are remembered per view.',
      'A Labels button cycles folder and file names through on, faint and off.',
    ],
  },
};
