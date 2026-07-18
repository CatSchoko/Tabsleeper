# Tab Sleeper

Legt inaktive Tabs schlafen und spart dadurch spürbar Arbeitsspeicher. Anders als der reine Chrome-"Discard"-Mechanismus wird die Originalseite beim Einschlafen **komplett entladen** (Navigation auf eine leichte interne Sleep-Seite + zusätzliches Discard) statt nur pausiert. Das bedeutet: deutlich mehr RAM wird freigegeben.

**Aufwachen geht ausschließlich über den "Wake"-Button** – ein normaler Klick auf den Tab reicht nicht (kein versehentliches Aufwachen mehr, wie es bei Chromes Standard-Discard passieren kann).

## Performance-Hinweis (v1.2.0)
Der Hintergrundprozess selbst wurde optimiert, um beim eigentlichen Ziel (Ressourcen sparen) nicht kontraproduktiv zu sein:
- Tab-Wechsel/Tab-Aktivität wird jetzt nur noch im Arbeitsspeicher vermerkt (vorher: Storage-Lese+Schreibzugriff bei JEDEM Tab-Wechsel)
- Das Badge (Anzahl schlafender Tabs) wird nur noch bei tatsächlicher Statusänderung aktualisiert (vorher: `chrome.tabs.query({})` über ALLE Tabs bei JEDEM Seitenladen in JEDEM Tab, unabhängig davon ob relevant)
- Ein einmal pro Minute laufender Abgleich (sowieso schon vorhanden für die Schlaf-Prüfung) korrigiert etwaige Abweichungen automatisch – keine Verhaltensänderung, nur weniger unnötige Hintergrund-Arbeit


## Installation (Chrome/Edge/Brave)
1. `chrome://extensions` öffnen
2. "Entwicklermodus" oben rechts aktivieren
3. "Entpackte Erweiterung laden" → diesen Ordner auswählen
4. Fertig – Icon erscheint in der Toolbar

## Nutzung
- Ein eingeschlafener Tab zeigt eine dunkle Seite mit **Wake**-Button in der Mitte
- Popup (Icon-Klick) zeigt zusätzlich alle schlafenden Tabs mit eigenem Wake-Button, "Alle wecken" und Statistik (aktuell schlafend, insgesamt eingeschlafen, geschätzte Ersparnis)
- Badge auf dem Extension-Icon zeigt die Anzahl gerade schlafender Tabs
- **Alt+S**: aktuellen Tab sofort schlafen legen (Tastenkombination unter `chrome://extensions/shortcuts` änderbar)
- Rechtsklick auf einen Tab → "Diesen Tab jetzt schlafen legen"
- YouTube-Videos merken sich beim Einschlafen die Wiedergabezeit und starten beim Wecken genau dort weiter
- Einstellungen im Popup:
  - Slider: Minuten bis ein Tab schläft
  - Whitelist-Domains (schlafen nie)
  - Gepinnte Tabs ausschließen
  - Tabs mit Ton ausschließen
- "Aktuellen Tab jetzt schlafen legen"-Button zum manuellen Sofort-Schlafen

Änderungen an den Einstellungen werden automatisch gespeichert (chrome.storage.sync).

