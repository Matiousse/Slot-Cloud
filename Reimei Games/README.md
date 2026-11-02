# Reimei Games

Studio de jeux (黎明, « l'aube »). Ce dossier regroupe les ressources communes du studio et ses machines à sous.

```
Reimei Games/
  intro/      intro animée du studio (logo, sceau 黎明, son synthétisé)
    studio-intro.ts   playStudioIntro() — à appeler au chargement d'un jeu
    sting.ts          son de l'intro (Web Audio)
    glyphs.json       contours vectoriels du logo (scripts/make-intro-glyphs.mjs)
    preview.html      aperçu autonome : ouvrir dans un navigateur
  slots/      les futures machines à sous du studio (un dossier par jeu)
```

Utilisation dans un jeu :

```ts
import { playStudioIntro } from '../../../intro/studio-intro'; // depuis slots/<jeu>/src
void playStudioIntro(); // ~4,4 s, passable d'un tap
```

Jeux : `slots/raijin-overload/` (**RAIJIN OVERLOAD**).
