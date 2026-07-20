/* i18n.js — lightweight EN/DE dictionary for the app chrome.
   Static markup uses data-i18n / data-i18n-ph (placeholder); dynamic strings
   go through window.T(key). Applied by app.js on boot and language change. */
'use strict';

(function () {
  const DICT = {
    en: {},
    de: {
      'All Projects': 'Alle Projekte',
      'Favorites': 'Favoriten',
      'Active': 'Aktiv',
      'Ideas': 'Ideen',
      'Paused': 'Pausiert',
      'Done': 'Fertig',
      'Archived': 'Archiviert',
      'TAGS': 'TAGS',
      'Graph View': 'Graph-Ansicht',
      'AI Assistant': 'KI-Assistent',
      'Stats': 'Statistiken',
      'Trash': 'Papierkorb',
      'Settings': 'Einstellungen',
      'New Project': 'Neues Projekt',
      'Search projects…  (Ctrl+F)': 'Projekte suchen…  (Strg+F)',
      'Last modified': 'Zuletzt geändert',
      'Newest': 'Neueste',
      'Name A–Z': 'Name A–Z',
      'Overview': 'Übersicht',
      'Files': 'Dateien',
      'Project Settings': 'Projekt-Einstellungen',
      'Description': 'Beschreibung',
      'Notes & Comments': 'Notizen & Kommentare',
      'Links': 'Links',
      'Related projects': 'Verknüpfte Projekte',
      'Add': 'Hinzufügen',
      'Add Files': 'Dateien hinzufügen',
      'New Folder': 'Neuer Ordner',
      'Save structure as template': 'Struktur als Vorlage speichern',
      'Ask AI': 'KI fragen',
      'Explorer': 'Explorer',
      'Location': 'Speicherort',
      'Accent color': 'Akzentfarbe',
      'Danger zone': 'Gefahrenzone',
      'Export as ZIP': 'Als ZIP exportieren',
      'Delete project (Trash)': 'Projekt löschen (Papierkorb)',
      'Remove from library (keep files)': 'Aus Bibliothek entfernen (Dateien behalten)',
      'What is this project about?': 'Worum geht es in diesem Projekt?',
      'Add a note…  (Ctrl+Enter)': 'Notiz hinzufügen…  (Strg+Enter)',
      'Restore': 'Wiederherstellen',
      'Delete forever': 'Endgültig löschen',
      'Trash is empty.': 'Der Papierkorb ist leer.',
      'Library stats': 'Bibliothek-Statistiken',
      'Projects': 'Projekte',
      'Total size': 'Gesamtgröße',
      'Biggest projects': 'Größte Projekte',
      'By status': 'Nach Status',
      'By tag': 'Nach Tag',
      'Find duplicate files': 'Doppelte Dateien finden',
      'Scanning…': 'Wird gescannt…',
      'No duplicates found.': 'Keine Duplikate gefunden.',
      'Ask about your projects…': 'Frag etwas zu deinen Projekten…',
      'Thinking…': 'Denkt nach…',
      'Sort into project': 'In Projekt einsortieren',
      'Testing connection…': 'Teste Verbindung…',
      'Connection works': 'Verbindung funktioniert',
      'Remember to hit Save & Close.': 'Denk an „Save & Close“.',
      'existing folders added as projects': 'bestehende Ordner als Projekte übernommen',
      'Copied to clipboard': 'In die Zwischenablage kopiert',
      'Project context copied. Paste it into the chat (Ctrl+V)': 'Projektkontext kopiert. Füge ihn im Chat ein (Strg+V)',
      'Exported': 'Exportiert',
      'deleted': 'gelöscht',
      'New update available': 'Neues Update verfügbar',
      'View on GitHub': 'Auf GitHub ansehen',
      'Update now': 'Jetzt updaten',
      'Restarting…': 'Startet neu…',
      'Got it': 'Alles klar',
      'Loading graph': 'Graph wird geladen',
      'projects': 'Projekte',
      'Default project folders': 'Standard-Projektordner',
      'Add folder': 'Ordner hinzufügen',
      'Which folder?': 'Welcher Ordner?',
    },
  };

  let lang = 'en';

  window.T = (s) => (DICT[lang] && DICT[lang][s]) || s;

  window.I18N = {
    set(l) { lang = DICT[l] ? l : 'en'; },
    get() { return lang; },
    apply(root = document) {
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = window.T(el.dataset.i18n);
      });
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        el.placeholder = window.T(el.dataset.i18nPh);
      });
    },
  };
})();
