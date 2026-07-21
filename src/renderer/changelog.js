/* changelog.js — per-version "What's new" content.
   A version has either a flat `items` list (old style) or `groups`, where each
   group is a coloured category with bullets, and a bullet may carry `sub`
   items to show how features connect. The modal shows the entry for the
   version the app just updated to. */
'use strict';

window.KRATE_CHANGELOG = {
  '1.3.1': {
    title: "What's new in Krate",
    groups: [
      {
        name: 'Graph view', color: '#f5b301',
        items: [
          {
            text: 'The graph now builds up piece by piece with a slim loading bar, so big libraries settle into place instead of exploding all at once.',
            sub: [
              'Full folder depth: folders are sized by how much they hold, folders are yellow and files are white.',
              'Labels button cycles folder and file names through on, faint and off.',
              'Tags button hides the #tag circles so you only see projects, folders and files.',
              'Right-click pins a node exactly where it is; pins are remembered per view.',
            ],
          },
        ],
      },
      {
        name: 'Updates', color: '#0e7fc0',
        items: [
          {
            text: 'Updates now show a sliding bar at the top with a one-click "Update now", instead of a popup.',
            sub: ['This "What\'s new" screen appears once after each update.'],
          },
        ],
      },
      {
        name: 'Projects & files', color: '#1fa855',
        items: [
          "Cover images can be framed: after uploading one, drag to move it and scroll to zoom so you choose exactly what shows.",
          'Add several default project folders and pick which one a new project goes in.',
          'Trash with restore and ZIP export, so nothing is lost and projects are easy to share.',
          'A Downloads watch folder that offers to sort new files, plus krate:// links that open a project from anywhere.',
        ],
      },
      {
        name: 'AI assistant', color: '#7a5af8',
        items: [
          {
            text: 'A built-in agent that can search and read your projects before it answers.',
            sub: ['Works with a Claude or Groq key, or sign in to a provider — in the side panel and the quick search.'],
          },
        ],
      },
      {
        name: 'Look & feel', color: '#d6409f',
        items: [
          'Windows and dialogs drag by their title bar; the sidebar and AI panel resize.',
          'Three themes (light, dark, purple) with a custom accent, and start-with-Windows in the background so the search hotkey always works.',
        ],
      },
    ],
  },
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
