# Document d'exigences

## 1. Aperçu de l'application

### 1.1 Nom de l'application
Block Puzzle 8x8 - Assistant de prédiction et suggestion

### 1.2 Description
Application d'assistance pour le jeu Block Puzzle sur grille 8x8. Analyse l'état actuel du plateau et propose des suggestions intelligentes de placement pour maximiser le score en fonction des blocs disponibles. Intègre un mode de jeu réel avec effacement automatique des lignes/colonnes complétées, système de score et renouvellement intelligent de la main. Implémente une stratégie Boss avec zone réservée et shuffle sélectif.

## 2. Utilisateurs et scénarios d'utilisation

### 2.1 Utilisateurs cibles
Joueurs de Block Puzzle (Blockudoku/Woodoku) cherchant à optimiser leurs placements et améliorer leur score.

### 2.2 Scénarios principaux
- Saisir l'état actuel de la grille de jeu (mode configuration)
- Sélectionner les 3 blocs disponibles en main
- Obtenir des suggestions de placement optimales
- Visualiser les placements suggérés avant de jouer
- Glisser-déposer des blocs depuis la Main vers la grille
- Jouer en mode réel avec effacement automatique et score
- Recevoir des recommandations IA pour les prochains blocs
- Utiliser le shuffle pour remplacer les blocs non-boss
- Observer la zone réservée pour le bloc boss

## 3. Structure des pages et fonctionnalités

### 3.1 Structure des pages

```
Application principale
├── Zone de grille 8x8 (centre)
│   ├── Overlay zone réservée boss (pointillés colorés)
│   └── Indicateurs lignes/colonnes quasi-complètes
├── Affichage du score (haut)
├── Panel de sélection des blocs courants (latéral ou bas)
│   ├── Slot 0 (gauche) avec bouton shuffle
│   ├── Slot 1 (milieu) avec badge Boss
│   └── Slot 2 (droite) avec bouton shuffle
├── Panel de suggestions (latéral)
└── Panel de configuration du thème (accessible)
```

### 3.2 Fonctionnalités détaillées

#### 3.2.1 Zone de grille 8x8
- Grille interactive de 64 cases (8 lignes × 8 colonnes)
- **Mode configuration** : Clic sur chaque case pour basculer entre état occupé/vide
- Color picker pour définir la couleur de chaque case occupée (mode configuration)
- Affichage visuel des cases occupées avec leur couleur respective
- Hover preview : aperçu du placement d'un bloc avant confirmation
- **Animation d'effacement** : flash visuel + disparition des cases lors de la complétion d'une ligne/colonne
- Indicateur du nombre de cases qui seraient libérées
- Zone de drop pour recevoir les blocs glissés depuis la Main
- Prévisualisation en temps réel pendant le survol d'un bloc draggé
- Validation visuelle des zones de placement (vert semi-transparent pour valide, rouge semi-transparent pour invalide)
- **Overlay zone réservée boss** : affichage en pointillés colorés de la zone optimale calculée pour le bloc boss
- **Indicateurs de progression par ligne/colonne** : barre visuelle montrant le nombre de cases remplies sur 8 pour chaque ligne et colonne
- **Indicateur zone active** : mise en évidence des lignes/colonnes en cours de remplissage stratégique

#### 3.2.2 Affichage du score
- Compteur de score en temps réel affiché en haut de l'écran
- Mise à jour immédiate après chaque effacement de ligne/colonne
- Animation de gain de points lors de l'effacement

#### 3.2.3 Catalogue des blocs
Liste complète des blocs disponibles, organisés par série :

**Série A** : A-3

**Série B** : B-3, B-5

**Série F** : F-5, F-6.1, F-7.5, F-9

**Série I** : I-1, I-2, I-3, I-4, I-5

**Série L** : L-3, L-4, L-5, L-6, L-7

**Série N** : N-5, N-6

**Série O** : O-4, O-6, O-8, O-9

**Série P** : P-5

**Série S** : S-2, S-3

**Série T** : T-4, T-5, T-6, T-7, T-7.1, T-9

**Série U** : U-5

**Série V** : V-5, V-6, V-7, V-9

**Série W** : W-5, W-6

**Série Y** : Y-5, Y-6, Y-7

**Série Z** : Z-4, Z-5, Z-6, Z-7, Z-9

Chaque bloc peut être transformé :
- Rotation : 0°, 90°, 180°, 270°
- Miroir : horizontal, vertical

#### 3.2.4 Sélection des blocs courants (Main)
- Interface de sélection pour choisir les 3 blocs actuellement disponibles dans la main du joueur
- **Organisation des slots** :
  + **Slot 0 (gauche)** : bloc standard avec bouton shuffle
  + **Slot 1 (milieu)** : bloc boss avec badge visuel et sans bouton shuffle
  + **Slot 2 (droite)** : bloc standard avec bouton shuffle
- Aperçu visuel de chaque bloc sélectionné
- Possibilité de modifier la sélection à tout moment (mode configuration)
- Chaque slot de bloc est draggable (source de drag)
- Conservation de l'orientation configurée (rotation, flip) lors du drag
- **Retrait automatique du bloc du slot après placement réussi sur la grille**
- **Renouvellement automatique** : Quand les 3 slots sont vides, la Main se recharge automatiquement avec 3 nouveaux blocs suggérés par l'IA
- Support des transformations (rotation, flip) avant et pendant le drag
- **Badge Boss** : affichage visuel sur le slot 1 indiquant le statut de bloc boss
- **Bouton shuffle** : bouton visible uniquement sur les slots 0 et 2 permettant de remplacer le bloc par une nouvelle suggestion IA

#### 3.2.5 Fonctionnalité de glisser-déposer
- Drag depuis la Main : l'utilisateur saisit un bloc dans un des 3 slots
- Pendant le survol de la grille :
  - Prévisualisation en temps réel du placement
  - Cases valides affichées en vert semi-transparent
  - Cases invalides (occupées ou débordement) affichées en rouge semi-transparent
  - **Alerte visuelle si le placement empiète sur la zone réservée du boss** (orange semi-transparent)
- Drop sur zone valide :
  - Le bloc est peint sur la grille avec sa couleur
  - Le bloc est retiré du slot de la Main
  - **Vérification automatique des lignes/colonnes complétées**
  - **Effacement des lignes/colonnes complètes avec animation d'explosion**
  - **Mise à jour du score**
  - **Mise à jour de la mémoire contextuelle** (zones récemment libérées)
  - **Recalcul de la zone réservée boss si nécessaire**
  - Animation de confirmation
- Drop sur zone invalide :
  - Animation de rejet
  - Message toast indiquant l'impossibilité du placement
  - Le bloc retourne dans son slot d'origine
- Support tactile pour mobile (touch events)
- Alternative clavier :
  - Sélection d'un bloc dans la Main avec Entrée
  - Navigation sur la grille avec flèches directionnelles
  - Validation du placement avec Entrée
  - Annulation avec Échap

#### 3.2.6 Moteur de suggestion
Analyse et propose des placements optimaux en fonction de :
- État actuel de la grille 8x8
- Les 3 blocs disponibles en main
- **Identification du bloc boss** (le plus grand, toujours au slot 1)
- **Zone réservée calculée pour le bloc boss**
- Probabilité d'apparition des blocs suivants (basée sur le catalogue complet)
- **Mémoire contextuelle** : zones récemment libérées lors des derniers coups
- **Stratégie de construction de setups** : priorise les configurations permettant des destructions multiples simultanées futures (combos de lignes + colonnes)
- **Prédiction multi-coups** : simule 2-3 coups à l'avance en échantillonnant des blocs représentatifs du catalogue pour anticiper les gains futurs
- **Scoring non-linéaire des combos** : récompense massivement les destructions simultanées de plusieurs lignes ET colonnes

Pour chaque suggestion :
- Position exacte sur la grille (ligne, colonne)
- Orientation du bloc (rotation + flip)
- Score estimé incluant le potentiel de combos futurs
- **Pénalité si le placement empiète sur la zone réservée du boss**
- Visualisation du placement sur la grille
- Mise en évidence des lignes/colonnes qui seraient complétées
- Indicateur du potentiel de combo futur

Classement des suggestions de la meilleure à la moins bonne.

**Priorité des suggestions** :
1. Placements des blocs slots 0 et 2 qui ne bloquent pas la zone réservée du boss
2. Placements créant des combos massifs (3+ lignes/colonnes)
3. Placements du boss uniquement si aucune autre option ou si combo massif garanti

#### 3.2.7 Calcul et affichage de la zone réservée boss
- **Identification du boss** : le bloc du slot 1 (milieu) est toujours le plus grand des 3 blocs
- **Calcul de la zone optimale** :
  + Analyse de toutes les positions possibles sur la grille pour le bloc boss
  + Évaluation du potentiel de combo futur pour chaque position
  + Sélection de la meilleure zone (celle maximisant les destructions futures)
- **Affichage visuel** :
  + Overlay en pointillés colorés sur la grille (couleur du bloc boss)
  + Transparence subtile pour ne pas gêner la visibilité
  + Mise à jour dynamique si la zone change après un placement
- **Recalcul** :
  + Après chaque placement de bloc
  + Après chaque effacement de lignes/colonnes
  + Si le boss est utilisé, recalcul pour la prochaine main

#### 3.2.8 Fonctionnalité shuffle
- **Disponibilité** : bouton visible uniquement sur les slots 0 (gauche) et 2 (droite)
- **Interdiction** : le slot 1 (boss) n'a pas de bouton shuffle et affiche un badge Boss
- **Action** :
  + Clic sur le bouton shuffle d'un slot
  + Le bloc actuel est remplacé par un nouveau bloc suggéré par l'IA
  + Le nouveau bloc est compatible avec l'état actuel de la grille
  + Le nouveau bloc ne bloque pas la zone réservée du boss
- **Suggestion IA** :
  + Analyse de la grille et de la zone réservée
  + Sélection d'un bloc du catalogue compatible
  + Privilégie les blocs permettant de continuer la stratégie en cours

#### 3.2.9 Mémoire contextuelle
- **Historique des zones libérées** :
  + Mémorisation des lignes/colonnes effacées lors des 3-5 derniers coups
  + Identification des directions stratégiques en cours (horizontale, verticale, mixte)
- **Utilisation** :
  + Privilégier les placements qui continuent dans la même direction
  + Favoriser les blocs qui complètent les lignes/colonnes en cours de remplissage
  + Afficher un indicateur zone active sur les lignes/colonnes stratégiques
- **Affichage** :
  + Mise en évidence visuelle des lignes/colonnes en cours de remplissage
  + Indicateur de progression (nombre de cases remplies sur 8)

#### 3.2.10 Auto-suggestion de nouveaux blocs
- **Déclenchement** : Après chaque placement de bloc, si un slot de la Main devient vide
- **Analyse IA** : Évalue l'état actuel de la grille pour recommander le prochain bloc optimal
- **Critères de sélection** :
  - Compatibilité avec l'état actuel de la grille
  - **Respect de la zone réservée du boss**
  - **Continuité avec la mémoire contextuelle** (zones actives)
  - Maximiser les futures destructions de lignes/colonnes
  - Éviter de bloquer la grille prématurément
  - Maintenir des options de placement variées
- **Affichage** : Indication visuelle du bloc recommandé pour le slot vide
- **Renouvellement complet** : Quand les 3 slots sont vides, génération automatique de 3 nouveaux blocs suggérés
  + **Le slot 1 reçoit toujours le plus grand bloc** (nouveau boss)
  + Les slots 0 et 2 reçoivent des blocs plus petits compatibles

#### 3.2.11 Panel de configuration du thème
- Color picker pour la couleur principale (accent color)
- Choix du style visuel : clair ou sombre
- Configuration des couleurs des blocs
- Contraintes de design :
  - Bordures : maximum rounded-md
  - Ombres : maximum shadow-md
  - Taille des éléments : moyenne

## 4. Règles métier et logique

### 4.1 Règles de placement
- Un bloc ne peut être placé que si toutes ses cases tombent sur des cases vides de la grille
- Un bloc peut être pivoté (0°, 90°, 180°, 270°) et retourné (miroir horizontal/vertical) avant placement
- **Une ligne ou colonne est complétée lorsque ses 8 cases sont toutes occupées**
- **Les lignes/colonnes complétées sont EFFACÉES (cases redeviennent vides) avec animation d'explosion**

### 4.2 Règles de glisser-déposer
- Le bloc draggé conserve l'orientation (rotation, flip) configurée dans son slot de la Main
- Pendant le survol de la grille, la position du bloc suit le curseur/doigt
- La validation du placement se fait en temps réel à chaque mouvement
- Cases valides : toutes les cases du bloc tombent sur des cases vides de la grille
- Cases invalides : au moins une case du bloc tombe sur une case occupée ou déborde de la grille
- **Alerte visuelle** : si le placement empiète sur la zone réservée du boss, affichage en orange semi-transparent
- Le drop est accepté uniquement si toutes les cases sont valides
- Après un drop réussi, le slot de la Main correspondant devient vide
- Sur mobile, le drag démarre après un appui long (éviter confusion avec scroll)

### 4.3 Règles du bloc boss
- **Identification** : le bloc du slot 1 (milieu) est toujours le plus grand des 3 blocs de la main
- **Statut** : le boss agit comme un parent des deux autres blocs
- **Interdiction shuffle** : le joueur ne peut pas remplacer le bloc boss via shuffle
- **Stratégie dernier recours** :
  + Les blocs des slots 0 et 2 sont placés en premier
  + Le boss n'est utilisé que si :
    * Aucune autre option de placement n'existe pour les blocs 0 et 2
    * Son placement crée un combo massif (3+ lignes/colonnes simultanées)
- **Zone réservée** :
  + L'IA calcule et affiche la meilleure zone possible pour le boss
  + Les suggestions pour les blocs 0 et 2 évitent de bloquer cette zone
  + Si le boss est utilisé, la zone réservée se recalcule pour la prochaine main

### 4.4 Calcul du score
- **Chaque ligne complétée et effacée rapporte des points**
- **Chaque colonne complétée et effacée rapporte des points**
- **Bonus pour effacements multiples simultanés** (plusieurs lignes/colonnes en un seul placement)
- **Scoring non-linéaire** : effacer 3 lignes en 1 coup vaut BEAUCOUP plus que 3 coups séparés d'une ligne chacun
- Le score total est affiché en temps réel et mis à jour immédiatement après chaque effacement

### 4.5 Algorithme de suggestion avancé

#### 4.5.1 Principe de construction de setups
- **Ne pas se précipiter à détruire** : L'algorithme ne cherche PAS à effacer des lignes immédiatement à tout prix
- **Construire des configurations** : Prioriser les placements qui créent des setups permettant des destructions multiples simultanées dans le futur
- **Objectif** : Maximiser les combos massifs (plusieurs lignes + colonnes en même temps)

#### 4.5.2 Prédiction sur blocs futurs inconnus
- L'IA connaît tout le catalogue de blocs existants
- **Échantillonnage du catalogue** : Imaginer quels blocs pourraient apparaître dans le futur
- **Planification anticipée** : Placer les blocs actuels de façon à maximiser les destructions futures potentielles
- **Optimisation long-terme** : Pas seulement le gain immédiat, mais le potentiel de gains futurs

#### 4.5.3 Récompense des combos massifs
- **Priorité absolue** : Configurations permettant de détruire 3 lignes + 3 colonnes simultanément
- **Blocs 3×3 stratégiques** : Placements libérant plusieurs lignes ET colonnes en même temps
- **Scoring non-linéaire** : Effacer 3 lignes en 1 coup vaut exponentiellement plus que 3 coups séparés
- **Bonus combo** : Récompense croissante pour 2×, 3×, 4× destructions simultanées

#### 4.5.4 Heuristiques de positionnement stratégique
- **Lignes/colonnes quasi-complètes** : Favoriser celles avec 6 ou 7 cases sur 8 remplies
- **Zones libres** : Maintenir des espaces dans la grille pour futurs blocs variés
- **Éviter la fragmentation** : Ne pas créer de petites zones isolées inaccessibles
- **Densité par région** : Chaque région 4×4 de la grille doit rester accessible pour placement
- **Équilibre spatial** : Répartir les cases occupées pour maximiser les options futures
- **Protection de la zone réservée boss** : Pénaliser fortement tout placement qui empiète sur cette zone

#### 4.5.5 Look-ahead multi-coups
- **Simulation 2-3 coups à l'avance** : Anticiper les placements futurs
- **Échantillons représentatifs** : Utiliser des blocs du catalogue pour simuler les coups suivants
- **Calcul d'espérance** : Évaluer le gain futur moyen sur plusieurs scénarios possibles
- **Arbre de décision** : Explorer les branches prometteuses pour identifier les meilleurs setups
- **Intégration de la mémoire contextuelle** : Privilégier les branches qui continuent les directions stratégiques en cours

#### 4.5.6 Évaluation finale
- Évalue tous les placements possibles pour chacun des 3 blocs disponibles
- Considère toutes les orientations possibles (rotation + flip)
- Calcule le score potentiel immédiat ET le potentiel de combos futurs
- **Applique une pénalité forte si le placement empiète sur la zone réservée du boss**
- **Priorise les placements des blocs 0 et 2 qui préservent la zone réservée**
- Classe les suggestions par score combiné décroissant (gain immédiat + espérance future - pénalité zone boss)

### 4.6 Logique de renouvellement de la Main
- **Déclenchement** : Quand les 3 slots de la Main sont vides
- **Génération IA** : Sélection de 3 nouveaux blocs parmi le catalogue complet
- **Critères de sélection** :
  - **Le slot 1 reçoit toujours le plus grand bloc** (nouveau boss)
  - Les slots 0 et 2 reçoivent des blocs plus petits
  - Compatibilité avec l'état actuel de la grille
  - Diversité des formes pour maximiser les options
  - Équilibre entre petits et grands blocs
  - Respect de la zone réservée du nouveau boss
- **Affichage** : Les 3 nouveaux blocs apparaissent simultanément dans les slots

### 4.7 Logique de shuffle
- **Déclenchement** : Clic sur le bouton shuffle d'un slot (0 ou 2 uniquement)
- **Remplacement** : Le bloc actuel est remplacé par un nouveau bloc suggéré par l'IA
- **Critères de sélection du nouveau bloc** :
  - Compatible avec l'état actuel de la grille
  - Ne bloque pas la zone réservée du boss
  - Privilégie les blocs permettant de continuer la stratégie en cours (mémoire contextuelle)
  - Taille inférieure ou égale au boss
- **Affichage** : Le nouveau bloc apparaît immédiatement dans le slot

### 4.8 Mémoire contextuelle
- **Enregistrement** : Après chaque effacement de lignes/colonnes, mémorisation des zones libérées
- **Historique** : Conservation des 3-5 derniers coups
- **Analyse** : Identification des directions stratégiques en cours (horizontale, verticale, mixte)
- **Utilisation** :
  + Privilégier les suggestions qui continuent dans la même direction
  + Favoriser les blocs qui complètent les lignes/colonnes en cours de remplissage
  + Afficher un indicateur zone active sur les lignes/colonnes stratégiques
- **Réinitialisation** : Si aucune direction claire n'émerge après plusieurs coups, réinitialisation de la mémoire

### 4.9 Animation d'effacement
- **Flash visuel** : Les cases des lignes/colonnes complétées clignotent brièvement
- **Disparition** : Les cases s'effacent avec une animation fluide
- **Feedback sonore** (optionnel) : Son de satisfaction lors de l'effacement
- **Durée** : Animation rapide (moins d'une seconde) pour maintenir le rythme de jeu

## 5. Cas exceptionnels et limites

| Situation | Comportement |
|-----------|-------------|
| Aucun placement possible pour les 3 blocs | Afficher un message indiquant l'impossibilité de placer les blocs |
| Grille vide | Suggérer des placements optimisant l'espace central + calculer zone réservée boss |
| Grille presque pleine | Prioriser les placements libérant le plus de lignes/colonnes + recalculer zone réservée boss |
| Plusieurs suggestions avec score identique | Afficher toutes les suggestions à égalité |
| Modification de la grille pendant l'affichage des suggestions | Recalculer automatiquement les suggestions + zone réservée boss |
| Drop d'un bloc sur zone invalide | Animation de rejet + message toast + retour du bloc dans son slot |
| Drop d'un bloc sur la zone réservée du boss | Placement autorisé mais alerte visuelle orange pendant le survol |
| Drag annulé (relâchement hors grille) | Le bloc retourne dans son slot d'origine |
| Drag simultané de plusieurs blocs | Bloquer le drag des autres blocs pendant qu'un drag est en cours |
| Perte de connexion pendant le drag | Le bloc retourne dans son slot, aucune modification de la grille |
| Effacement de plusieurs lignes/colonnes simultanément | Animation d'explosion pour toutes les lignes/colonnes concernées + bonus de score + mise à jour mémoire contextuelle |
| Renouvellement de la Main impossible (aucun bloc compatible) | Afficher un message de fin de partie |
| Clic sur bouton shuffle du slot 1 (boss) | Aucune action, le bouton n'est pas affiché sur ce slot |
| Shuffle d'un bloc alors que la grille est presque pleine | Sélection d'un bloc très petit compatible avec les espaces restants |
| Zone réservée boss impossible à calculer (grille trop pleine) | Pas d'affichage de zone réservée, suggestions normales pour tous les blocs |

## 6. Critères de validation

1. Ouvrir l'application et afficher la grille 8x8 vide avec le compteur de score à zéro
2. Configurer l'état initial de la grille en mode configuration
3. Sélectionner 3 blocs dans la Main et vérifier que le slot 1 affiche le badge Boss et n'a pas de bouton shuffle
4. Observer l'affichage de la zone réservée boss en pointillés colorés sur la grille
5. Glisser un bloc du slot 0 ou 2 vers la grille et vérifier que les suggestions évitent la zone réservée
6. Déposer le bloc sur une zone valide et vérifier l'effacement des lignes/colonnes complètes avec mise à jour du score
7. Cliquer sur le bouton shuffle d'un slot 0 ou 2 et vérifier le remplacement du bloc par une nouvelle suggestion IA
8. Placer les 3 blocs et observer le renouvellement automatique avec le nouveau boss au slot 1
9. Vérifier que les indicateurs de progression par ligne/colonne s'affichent correctement
10. Observer la mise à jour de la zone réservée boss après chaque placement

## 7. Fonctionnalités non implémentées dans cette version

- Sauvegarde de l'historique des parties
- Statistiques de performance du joueur
- Mode multijoueur ou comparaison de scores
- Tutoriel interactif
- Système de niveaux ou de progression
- Export/import de configurations de grille
- Intégration directe avec le jeu Block Puzzle réel
- Mode entraînement avec défis prédéfinis
- Analyse des erreurs de placement passées
- Suggestions basées sur l'apprentissage du style de jeu de l'utilisateur
- Feedback sonore lors des placements et effacements
- Classement en ligne ou partage de scores
- Mode contre-la-montre ou défis quotidiens
- Limite du nombre de shuffles par partie
- Coût en points pour utiliser le shuffle
- Historique des shuffles effectués