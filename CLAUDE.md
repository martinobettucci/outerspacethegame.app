# CLAUDE.md

Instructions générales de travail

Ce fichier est lu au début de chaque session.

Il définit les conventions durables du responsable du projet, "martino.bettucci@gmail.com".

Ces règles s'appliquent par défaut à tous les projets, sauf lorsqu'un fichier local documente explicitement une contrainte différente imposée par le projet, son infrastructure ou son environnement d'exécution.

Les règles locales peuvent préciser le fonctionnement d'un projet, mais elles ne doivent jamais réduire les exigences de qualité, de sécurité, de documentation ou de vérification définies ici.

## 1. Principes de travail

- Travailler directement sur la demande formulée.
- Ne pas inventer de périmètre fonctionnel supplémentaire.
- Ne pas modifier des éléments sans rapport avec la tâche.
- Ne pas remplacer une solution existante fonctionnelle sans justification technique.
- Préférer une solution simple, explicite, maintenable et testable.
- Traiter une seule tâche cohérente à la fois.
- Travailler séquentiellement.
- Ne pas déléguer à des sous-agents.
- Ne pas considérer une hypothèse comme un fait vérifié.
- Signaler clairement toute limitation, incertitude ou vérification impossible.
- Ne jamais déclarer une tâche terminée sans preuve concrète de son fonctionnement.

## 2. Compréhension du projet

Avant toute modification significative :

- lire le "README.md" ;
- lire le "CHANGELOG.md" ;
- inspecter la structure du dépôt ;
- identifier les commandes de lancement, de build et de test ;
- lire les documents présents dans "docs/" ;
- identifier les conventions locales du projet ;
- vérifier l'état Git courant ;
- comprendre les composants, services, données et flux concernés par la demande.

Ne pas déduire l'architecture uniquement à partir du nom des fichiers.

Pour une tâche exploratoire ou impliquant plusieurs décisions, maintenir un journal de réflexion dans "docs/JOURNAL.md" ou dans un document équivalent.

## 3. Stack et architecture

Langages et frameworks préférés

- Python pour l'intelligence artificielle, le machine learning, le traitement de données et les services backend lorsque ce choix est adapté.
- React avec Vite pour les interfaces web lorsque ce choix est adapté.
- Utiliser les technologies déjà adoptées par le projet lorsqu'elles sont cohérentes et maintenues.
- Ne pas introduire un nouveau framework, une nouvelle base de données ou un nouveau service sans nécessité documentée.

Architecture

- Séparer clairement les responsabilités.
- Préserver une architecture modulaire.
- Éviter les dépendances circulaires.
- Centraliser la configuration.
- Éviter les valeurs métier codées en dur.
- Préférer les contrats explicites entre les composants.
- Concevoir les fonctionnalités pour qu'elles soient testables automatiquement.
- Ne pas masquer une dette technique par une couche supplémentaire de complexité.
- Documenter les choix structurants et leurs compromis.

Conteneurisation

Tout projet qui peut raisonnablement être conteneurisé doit l'être.

Prévoir, selon les besoins du projet :

- un environnement de développement ;
- un environnement de staging ;
- un environnement de production ;
- des fichiers Compose ou configurations équivalentes clairement séparés ;
- des commandes de lancement explicites telles que "runDev", "runStaging" et "runProd", ou leurs équivalents documentés.

L'environnement de développement doit être aussi autonome que possible :

- aucun service cloud obligatoire lorsque son équivalent local peut être fourni ;
- initialisation automatisée ;
- dépendances démarrées automatiquement ;
- base de données recréable ;
- données de démonstration reproductibles ;
- tests E2E exécutables de bout en bout.

Les environnements staging et production doivent utiliser des variables d'environnement dédiées.

Chaque variable doit être documentée avec :

- son rôle ;
- son format attendu ;
- son caractère obligatoire ou facultatif ;
- une valeur d'exemple non sensible lorsque cela est utile.

Aucune clé, aucun mot de passe, aucun jeton ou secret réel ne doit être ajouté au dépôt.

## 4. Interface et expérience utilisateur

Charte P2Enjoy SAS

Toute interface produite pour un projet P2Enjoy doit utiliser par défaut la charte suivante :

- bleu primaire : "#23468C" ;
- vert succès : "#238C33" ;
- jaune accent : "#D9CF4A" ;
- rouge danger : "#F24141" ;
- noir principal : "#0D0D0D".

Principes visuels par défaut :

- thème clair ;
- hiérarchie visuelle nette ;
- cartes avec coins arrondis ;
- navigation compacte et lisible ;
- couleurs utilisées avec une signification cohérente ;
- densité d'information maîtrisée ;
- responsive design ;
- accessibilité clavier ;
- contrastes suffisants ;
- états de chargement, d'erreur, de succès et d'absence de données explicitement traités.

Design system

Tout projet comportant une interface maintient un fichier :

"docs/DESIGN_SYSTEM.md"

Ce document décrit au minimum :

- les couleurs ;
- les tokens ;
- la typographie ;
- les espacements ;
- les composants principaux ;
- les états interactifs ;
- les règles responsive ;
- les règles d'accessibilité ;
- les conventions d'icônes ;
- les éventuels écarts propres au projet.

Utiliser des icônes vectorielles cohérentes, par exemple Lucide.

Ne pas utiliser d'emojis comme substituts d'icônes dans une interface applicative.

Ne pas produire une interface générique caractéristique des thèmes automatiques d'outils IA. Chaque interface doit avoir une composition intentionnelle et cohérente avec le produit.

Architecture de l'information

Pour les outils de gestion, privilégier une architecture centrée sur l'objet métier principal.

L'objet principal doit être traité comme un citoyen de première classe.

Les environnements, variantes ou configurations secondaires doivent être modélisés comme des contextes ou des surcharges lorsque cela permet d'éviter la duplication.

Tout existe par défaut au niveau général, puis les contextes spécialisés ne définissent que leurs différences lorsque cette architecture est pertinente.

Composants configurables

Lorsqu'une interface publique ou éditoriale est composée de sections administrables :

- chaque section doit être un composant indépendant ;
- l'ordre doit être stocké dans les données ;
- l'ajout, la suppression et le réordonnancement doivent être possibles lorsque le produit le prévoit ;
- les blocs configurables ne doivent pas être codés en dur dans la page ;
- seuls les éléments explicitement définis comme fixes peuvent rester hors du système de composition.

## 5. Documentation obligatoire

Les documents suivants doivent exister ou avoir un équivalent clairement identifié :

- "README.md" ;
- "CHANGELOG.md" ;
- "docs/DAT.md" ;
- "docs/DESIGN_SYSTEM.md" pour les projets avec interface ;
- "docs/JOURNAL.md" ;
- "docs/BACKLOG.md" ;
- "docs/manual.md" ou un dossier "manuals/" lorsque le projet nécessite une documentation utilisateur ;
- un document de préparation du déploiement lorsque des opérations manuelles sont nécessaires.

La documentation fait partie du produit.

Une tâche n'est pas terminée si le code et la documentation ne décrivent plus le même fonctionnement.

Persistance immédiate des décisions (règle non négociable du responsable)

Dès qu'une spécification, une décision de conception ou un résultat de
brainstorm est validé par le responsable, TOUS les artefacts documentaires
correspondants doivent être écrits ET committés IMMÉDIATEMENT, AVANT
d'écrire la moindre ligne de code.

Cela concerne notamment, sans s'y limiter :

- la spécification validée (guide de conception, canon, sections chiffrées) ;
- le journal d'exploration et de décision ("JOURNAL.md" ou équivalent) ;
- les schémas de données et d'architecture ("docs/SCHEMA.md", "docs/DAT.md") ;
- le backlog ("docs/BACKLOG.md") ;
- le changelog, le contrat de déploiement, et tout document impacté.

Motif : une décision ou un brainstorm du responsable ne doit JAMAIS
n'exister que dans la mémoire de contexte de l'agent. Cette conversation
peut être supprimée à tout instant ; une décision non persistée est une
décision perdue. Laisser une spécification validée ou un journal
uniquement en mémoire de contexte constitue une faute grave.

Règles d'application :

- committer les documents AVANT de commencer l'implémentation, dans un
  commit dédié si le code n'est pas encore prêt ;
- ne jamais reporter la persistance documentaire « à la fin du chunk » ;
- lorsqu'un découpage en étapes/chunks est décidé, le plan de découpage
  lui-même est un artefact documentaire à persister, pas seulement une
  narration de conversation ;
- pousser le commit immédiatement après sa création (cf. §13).

README

Le "README.md" doit documenter au minimum :

- l'objectif du projet ;
- la stack ;
- les prérequis ;
- l'installation ;
- les commandes principales ;
- le lancement en développement ;
- le lancement des tests ;
- le build ;
- les variables d'environnement ;
- la structure principale du dépôt ;
- les limites connues.

DAT

Le dossier d'architecture technique doit documenter :

- les composants ;
- les services ;
- les flux ;
- les dépendances ;
- les modèles de données ;
- les interfaces ;
- les mécanismes d'authentification ;
- les règles d'autorisation ;
- les stratégies de déploiement ;
- les stratégies de reprise ;
- les données de développement ;
- les commandes de lancement ;
- les choix techniques importants ;
- les compromis connus.

Journal

"docs/JOURNAL.md" conserve une trace chronologique des décisions et investigations significatives.

Chaque entrée doit préciser lorsque cela est pertinent :

- le problème ;
- les hypothèses ;
- les observations ;
- les solutions envisagées ;
- la décision ;
- les conséquences ;
- les vérifications réalisées.

Backlog

"docs/BACKLOG.md" utilise les statuts suivants :

- "[ ]" : non commencé ;
- "[~]" : en cours ou implémenté mais insuffisamment vérifié ;
- "[x]" : terminé et intégralement vérifié.

Une tâche ne passe à "[x]" qu'après validation de sa Definition of Done.

## 6. CHANGELOG

Le "CHANGELOG.md" contient toujours deux sections principales :

## [Non publié]

## [Publié]

Section Non publié

Toute nouvelle entrée est ajoutée sous "[Non publié]".

Cette section contient uniquement ce qui existe dans le code courant mais n'est pas encore réellement déployé et vérifié en production.

Lorsqu'elle est vide, utiliser un placeholder explicite :

_Rien à publier pour le moment._

Section Publié

La section "[Publié]" contient uniquement les changements réellement déployés et vérifiés en production.

Après un déploiement confirmé :

1. vérifier que la production exécute bien le code attendu ;
2. déplacer l'intégralité du contenu de "[Non publié]" en tête de "[Publié]" ;
3. ajouter une entrée datée ;
4. préciser les opérations de déploiement importantes ;
5. vider "[Non publié]" ;
6. restaurer le placeholder.

Format recommandé :

### Déployé en production, AAAA-MM-JJ

- Changements déployés.
- Migrations appliquées.
- Services ou fonctions mis à jour.

Ne jamais déclarer comme publié un changement qui n'est pas réellement actif et vérifié en production.

## 7. Documentation utilisateur

La documentation publique ou utilisateur doit rester synchronisée avec le comportement réel de l'application.

Elle doit être :

- pédagogique ;
- complète ;
- compréhensible sans lire le code ;
- dépourvue de secrets ;
- dépourvue de clés ;
- dépourvue d'adresses internes ;
- dépourvue de détails exploitables sur l'infrastructure réelle.

Les noms de variables d'environnement peuvent être mentionnés.

Leurs valeurs réelles ne doivent jamais apparaître.

Tout changement de comportement doit mettre à jour la documentation correspondante dans le même chunk de travail.

Tout changement d'interface doit mettre à jour les pages concernées, notamment en cas de :

- nouveau champ ;
- suppression d'un champ ;
- nouvelle validation ;
- nouveau bouton ;
- nouvelle modale ;
- nouvel onglet ;
- nouvelle page ;
- nouvelle option ;
- nouveau statut ;
- nouveau filtre ;
- nouveau message ;
- modification d'un parcours.

Les captures d'écran doivent être renouvelées lorsque l'apparence ou le parcours change.

La documentation doit être produite à partir du comportement réel et des composants existants, jamais uniquement à partir de la mémoire de l'agent.

## 8. Données de développement et démonstration

Lorsqu'un projet possède des données seedées, le seed constitue un contrat maintenu.

Il doit permettre de démontrer chaque fonctionnalité livrée.

Les données de développement doivent :

- être reproductibles ;
- être réalistes ;
- couvrir les principaux profils ;
- couvrir les principaux états ;
- couvrir les cas de succès ;
- couvrir les erreurs attendues ;
- couvrir les branches alternatives ;
- éviter les écrans vides lorsque des données de démonstration sont nécessaires ;
- utiliser des identifiants stables lorsque les tests et captures en dépendent.

Toute nouvelle fonctionnalité qui introduit une table, une page, un statut, un flux, une option ou une règle métier doit mettre à jour le seed dans le même changement.

Lorsque cela est possible, les données doivent être créées via les mêmes API, commandes, services ou fonctions que ceux utilisés par l'application.

Ne pas fabriquer artificiellement des traces censées représenter l'exécution d'un processus réel.

Par exemple :

- un e-mail de démonstration doit être envoyé par le véritable mécanisme d'envoi local ;
- une notification doit passer par le véritable service local ;
- une inscription doit utiliser le véritable flux applicatif ;
- une erreur de démonstration doit provenir d'un scénario reproductible.

Les secrets chiffrés doivent être créés par le même mécanisme que celui utilisé lors de l'exécution normale.

## 9. Sécurité des environnements

Production

La production est une source de vérité.

Par défaut :

- ne jamais modifier les données de production pendant une tâche de développement ;
- ne jamais appliquer automatiquement une migration en production ;
- ne jamais utiliser une clé de production pour les tests ;
- ne jamais relier un environnement local à une base de production en écriture ;
- ne jamais exécuter de commande destructive ;
- ne jamais supposer qu'une opération de production est autorisée.

Les accès de développement à la production doivent être en lecture seule lorsqu'ils sont nécessaires pour inspecter :

- un schéma ;
- une configuration ;
- des données de référence ;
- un comportement existant ;
- une différence entre les environnements.

Toute modification de production nécessite une instruction humaine explicite.

Lorsque le projet définit une politique plus restrictive, appliquer la règle la plus restrictive.

Opérations destructives

Avant toute opération susceptible de supprimer, remplacer ou transformer des données :

- identifier l'environnement ;
- vérifier la cible ;
- vérifier l'existence d'une sauvegarde ;
- documenter l'impact ;
- privilégier une simulation ;
- demander une validation humaine lorsque l'opération touche des données partagées, staging ou production.

Ne jamais utiliser une commande destructive par commodité.

## 10. Autorisations et contrôle d'accès

Les termes suivants impliquent toujours une règle appliquée côté backend :

- autorisé ;
- interdit ;
- public ;
- privé ;
- visible ;
- caché ;
- accessible ;
- restreint ;
- peut lire ;
- peut écrire ;
- peut modifier ;
- peut supprimer ;
- peut exécuter ;
- doit accepter avant de continuer.

Un contrôle dans l'interface n'est jamais suffisant.

Masquer un bouton ou désactiver un champ constitue uniquement une aide d'interface.

La règle réelle doit être appliquée au niveau approprié :

- base de données ;
- API ;
- service backend ;
- middleware ;
- fonction serveur ;
- politique RLS lorsque la technologie la prend en charge ;
- contrôle d'autorisation centralisé ;
- règle de stockage.

Toute règle d'accès doit être vérifiée par une requête directe qui contourne l'interface.

Le test doit démontrer que l'opération interdite est refusée avec les véritables identifiants ou droits du profil concerné.

Les règles basées sur un consentement ou une acceptation doivent utiliser une donnée persistée côté serveur.

Un simple booléen client ne constitue pas une preuve d'acceptation.

## 11. Confidentialité, RGPD et stockage côté client

Limiter le stockage sur l'appareil aux données nécessaires.

Chaque nouvelle donnée stockée côté client doit appartenir à l'une des catégories suivantes :

1. strictement nécessaire au fonctionnement demandé ;
2. limitée à la session pour une préférence d'interface temporaire ;
3. persistante avec consentement explicite lorsque ce consentement est requis.

Ne pas ajouter silencieusement :

- de cookie non essentiel ;
- de donnée persistante dans "localStorage" ;
- de tracker ;
- d'outil analytique ;
- de publicité ;
- de mécanisme d'identification transverse.

Lorsqu'une préférence peut rester limitée à la session, utiliser "sessionStorage" ou un mécanisme équivalent.

Lorsqu'une persistance facultative est proposée, elle doit être associée à une action explicite de l'utilisateur.

Le refus doit rester possible et ne doit pas bloquer une fonctionnalité qui n'a pas besoin de cette persistance.

Toute évolution susceptible de modifier la posture de consentement doit être documentée et soumise à validation humaine.

## 12. Contrat de déploiement

Lorsqu'un projet nécessite des opérations manuelles avant ou pendant le déploiement, maintenir un document dédié, par exemple :

"PROD_MIGRATIONS.md"

Ce document décrit précisément ce que l'humain doit appliquer.

Il doit contenir selon le projet :

- la baseline de production ;
- les migrations en attente ;
- leur ordre ;
- leur objectif ;
- leurs dépendances ;
- les fonctions ou services à redéployer ;
- les variables ou secrets à ajouter ;
- les tâches de vérification ;
- les procédures de retour arrière ;
- les risques connus.

Toute modification portant sur le schéma, les fonctions backend, les services déployés ou les variables d'environnement doit mettre à jour ce document dans le même changement.

Lorsqu'un déploiement est confirmé :

- déplacer les opérations réalisées dans la baseline ;
- vider les listes d'opérations en attente ;
- mettre à jour la date ou la référence de production ;
- conserver uniquement les actions encore nécessaires.

Ce fichier ne doit jamais dériver de l'état réel du projet.

## 13. Gestion Git

Branche courante

Ne jamais créer de branche, de worktree ou d'environnement Git parallèle.

Travailler uniquement :

- dans le dépôt courant ;
- dans le répertoire courant ;
- sur la branche courante.

Commandes interdites sans instruction explicite du responsable :

- "git branch" pour créer une branche ;
- "git checkout -b" ;
- "git switch -c" ;
- "git worktree add" ;
- toute stratégie d'isolation par branche ou worktree.

Lorsque plusieurs développeurs ou agents travaillent sur la même branche, gérer les changements sur place.

Ne pas contourner un conflit en créant une nouvelle branche.

Synchronisation

Avant de tester définitivement ou de clore une tâche :

- récupérer les modifications distantes ;
- vérifier que le travail local est compatible avec l'état distant ;
- résoudre proprement les éventuels conflits ;
- rejouer les tests nécessaires après synchronisation.

Ne pas écraser les modifications d'un autre contributeur.

Commits

- Les messages de commit sont rédigés en français.
- Un commit correspond à un chunk cohérent.
- Un commit ne doit contenir que des modifications liées.
- Le code doit être vérifié avant le commit.
- La documentation associée doit faire partie du même commit.
- Les tests associés doivent faire partie du même commit.
- Pousser systématiquement après chaque commit validé, y compris pour les étapes intermédiaires cohérentes.

Ne pas regrouper artificiellement plusieurs sujets indépendants dans un seul commit.

## 14. Exécution et environnement local

Au début d'une session :

- vérifier que les dépendances nécessaires sont disponibles ;
- démarrer Docker lorsque le projet en dépend ;
- vérifier les services locaux ;
- vérifier les variables d'environnement locales ;
- utiliser les scripts de bootstrap fournis par le projet ;
- éviter les initialisations manuelles non documentées.

Les commandes principales doivent être reproductibles.

Le projet doit documenter au minimum :

- l'installation ;
- le bootstrap ;
- le démarrage ;
- la réinitialisation des données ;
- le seed ;
- les tests ;
- le build ;
- l'arrêt propre des services.

Ne pas laisser une procédure importante uniquement dans l'historique du terminal.

## 15. Tests

Règle générale

Chaque tâche possède ses propres tests.

Toute unité de backlog doit disposer au minimum :

- d'un test unitaire spécifique ;
- d'un test E2E spécifique.

Ajouter également un test d'API ou d'intégration lorsque le comportement concerne :

- une API ;
- une base de données ;
- un service ;
- une file de messages ;
- une fonction backend ;
- un fournisseur externe ;
- une autorisation ;
- un flux interservices.

Une tâche dont le code existe mais dont les tests propres manquent reste "[~]".

Tests unitaires

Les tests unitaires doivent :

- cibler la logique ajoutée ou modifiée ;
- vérifier les cas nominaux ;
- vérifier les limites ;
- vérifier les erreurs ;
- éviter de tester uniquement l'implémentation interne ;
- produire des erreurs compréhensibles.

Tests API et intégration

Ils doivent utiliser autant que possible :

- la vraie base locale ;
- les vraies migrations ;
- les vraies politiques d'accès ;
- les vrais services locaux ;
- les véritables formats d'échange.

Ne pas remplacer systématiquement les composants critiques par des mocks.

Les mocks sont acceptables pour les dépendances externes impossibles à exécuter localement, mais le contrat simulé doit être documenté et réaliste.

Tests E2E

Chaque fonctionnalité visible ou parcours utilisateur doit être vérifié avec Playwright ou un outil E2E équivalent.

Les tests doivent :

- partir d'un état déterministe ;
- utiliser les données seedées ;
- couvrir le parcours complet ;
- vérifier les résultats visibles ;
- vérifier les effets backend lorsqu'ils existent ;
- couvrir les refus d'autorisation ;
- capturer les erreurs utiles au diagnostic.

Lorsqu'un comportement n'est pas directement observable dans l'interface, créer un chemin déterministe permettant de le tester réellement.

Ce chemin peut utiliser :

- un endpoint dédié à l'environnement de test ;
- un conteneur jetable ;
- une donnée seedée ;
- un événement contrôlé ;
- un service local ;
- une instrumentation de test non disponible en production.

Ne pas contourner une exigence E2E en remplaçant le comportement par une simulation sans valeur probante.

## 16. Vérification visuelle

Les tests automatisés ne remplacent pas l'observation visuelle.

Pour toute modification d'interface :

- démarrer l'application ;
- exécuter le parcours concerné ;
- produire des captures JPEG ;
- produire une vidéo ".webm" lorsque le parcours ou l'animation le justifie ;
- observer les résultats avec les capacités de vision ;
- vérifier les principaux formats d'écran ;
- vérifier les états d'erreur ;
- vérifier les états vides ;
- vérifier les données longues ;
- vérifier les modales ;
- vérifier les menus ;
- vérifier les débordements ;
- vérifier les contrastes ;
- vérifier les éléments interactifs.

Ne jamais considérer qu'une interface fonctionne uniquement parce que le build et les tests unitaires réussissent.

Les captures doivent représenter l'état réellement exécuté de l'application.

## 17. Definition of Done

Une tâche n'est terminée que lorsque toutes les conditions applicables sont satisfaites :

- le comportement demandé est implémenté ;
- le code est lisible ;
- le code est cohérent avec l'architecture ;
- les erreurs sont gérées ;
- la sécurité est appliquée côté backend ;
- les autorisations sont testées directement ;
- les tests unitaires spécifiques réussissent ;
- les tests API ou d'intégration spécifiques réussissent ;
- les tests E2E spécifiques réussissent ;
- le build réussit ;
- l'interface a été vérifiée visuellement ;
- les captures ont été observées ;
- les données seedées ont été mises à jour ;
- le README a été mis à jour si nécessaire ;
- le DAT a été mis à jour si nécessaire ;
- le design system a été mis à jour si nécessaire ;
- le manuel utilisateur a été mis à jour si nécessaire ;
- le changelog a été mis à jour sous "[Non publié]" ;
- le contrat de déploiement a été mis à jour si nécessaire ;
- le backlog reflète le véritable état ;
- les modifications distantes ont été récupérées ;
- les tests ont été rejoués après synchronisation ;
- le commit cohérent a été créé ;
- le commit a été poussé.

Si une seule preuve importante manque, conserver le statut "[~]".

Ne jamais déclarer terminé ce qui a uniquement été commencé, codé partiellement ou testé superficiellement.

## 18. Gestion des erreurs et régressions

Lorsqu'un défaut est constaté :

1. reproduire le défaut ;
2. identifier le comportement attendu ;
3. localiser la cause ;
4. ajouter un test qui échoue avant correction ;
5. corriger la cause ;
6. vérifier que le nouveau test réussit ;
7. rejouer les tests connexes ;
8. vérifier visuellement lorsque l'interface est concernée ;
9. documenter la correction ;
10. vérifier l'absence de régression.

Ne pas masquer une erreur par :

- un "try/catch" vide ;
- une valeur par défaut trompeuse ;
- la suppression d'un message ;
- la désactivation d'un test ;
- une condition spécifique à un cas particulier ;
- une temporisation arbitraire ;
- une simulation de succès.

## 19. Dépendances et services externes

Avant d'ajouter une dépendance :

- vérifier qu'elle est nécessaire ;
- vérifier sa maintenance ;
- vérifier sa licence ;
- vérifier son impact sur le bundle ou l'image ;
- vérifier ses vulnérabilités connues ;
- vérifier sa compatibilité avec la stack ;
- vérifier qu'une fonction native ou une dépendance existante ne suffit pas.

Toute dépendance structurante doit être documentée dans le DAT.

Tout service externe doit disposer lorsque cela est pertinent :

- d'un mécanisme de timeout ;
- d'une gestion des erreurs ;
- d'une stratégie de retry contrôlée ;
- d'une limitation de débit ;
- d'une journalisation ;
- d'un mode dégradé ;
- d'un équivalent local ou simulé pour les tests ;
- d'une configuration par variables d'environnement.

Ne pas rendre le développement local dépendant d'un service payant lorsque cela peut être évité.

## 20. Observabilité

Les services doivent produire des informations exploitables sans exposer de données sensibles.

Prévoir selon les besoins :

- logs structurés ;
- niveaux de logs ;
- identifiants de corrélation ;
- métriques ;
- health checks ;
- readiness checks ;
- traces ;
- erreurs contextualisées.

Ne jamais journaliser :

- mots de passe ;
- secrets ;
- clés privées ;
- jetons complets ;
- données personnelles inutiles ;
- contenus confidentiels sans nécessité ;
- en-têtes d'authentification complets.

Les erreurs doivent permettre le diagnostic sans exposer l'infrastructure ou les secrets à l'utilisateur final.

## 21. Performances

Ne pas optimiser sans mesure.

Pour toute optimisation significative :

- définir le problème ;
- mesurer l'état initial ;
- identifier le goulot ;
- appliquer une modification ciblée ;
- mesurer le résultat ;
- documenter le compromis.

Éviter :

- les requêtes répétitives ;
- les chargements inutiles ;
- les boucles réseau ;
- les recalculs évitables ;
- les composants trop volumineux ;
- les dépendances lourdes non justifiées ;
- les traitements synchrones bloquants ;
- les données chargées sans pagination lorsque leur volume peut croître.

## 22. Accessibilité

Toute interface doit prendre en compte :

- la navigation clavier ;
- les labels de formulaire ;
- les messages d'erreur ;
- les rôles sémantiques ;
- les focus visibles ;
- les contrastes ;
- les textes alternatifs ;
- les annonces pour les changements importants ;
- la lisibilité des états désactivés ;
- la taille des cibles interactives.

Une interface visuellement correcte mais inutilisable au clavier n'est pas terminée.

## 23. Internationalisation

Lorsque le projet est multilingue ou susceptible de le devenir :

- ne pas disperser les textes dans les composants ;
- centraliser les traductions ;
- utiliser des clés stables ;
- prévoir les textes longs ;
- prévoir les formats de date, d'heure et de nombre ;
- éviter de construire des phrases par concaténation ;
- documenter la langue par défaut ;
- tester au moins une langue plus longue que la langue principale.

## 24. Changements de schéma et migrations

Toute évolution du modèle de données doit :

- être représentée par une migration versionnée ;
- être reproductible localement ;
- conserver l'ordre des dépendances ;
- documenter son objectif ;
- mettre à jour le DAT ;
- mettre à jour les seeds ;
- mettre à jour les tests ;
- mettre à jour le contrat de déploiement ;
- prévoir un retour arrière ou documenter pourquoi il n'est pas possible.

Ne jamais modifier manuellement un schéma partagé sans migration.

Ne jamais appliquer une migration de production sans instruction humaine explicite.

## 25. Format du compte rendu de travail

À la fin d'un chunk, fournir un compte rendu factuel comprenant :

- ce qui a été modifié ;
- les fichiers principaux concernés ;
- les tests exécutés ;
- les résultats obtenus ;
- les vérifications visuelles réalisées ;
- les documents mis à jour ;
- les migrations ou opérations de déploiement nécessaires ;
- les limites ou éléments restant en cours ;
- le commit créé ;
- l'état du push.

Ne pas annoncer une réussite lorsque certains contrôles n'ont pas pu être exécutés.

Utiliser explicitement des formulations comme :

- implémenté et vérifié ;
- implémenté mais non vérifié en E2E ;
- en cours ;
- bloqué par une dépendance ;
- non testé sur l'environnement cible ;
- nécessite une action humaine.

## 26. Priorité des règles

En cas de conflit, appliquer cet ordre de priorité :

1. sécurité des personnes et des données ;
2. instructions explicites du responsable ;
3. interdictions concernant la production ;
4. intégrité des données ;
5. règles locales documentées du projet ;
6. exigences de tests et de vérification ;
7. architecture existante ;
8. conventions générales de ce fichier ;
9. préférences stylistiques ou optimisations secondaires.

Une instruction locale ne peut pas autoriser :

- une écriture non validée en production ;
- l'exposition d'un secret ;
- la suppression non validée de données ;
- l'abandon des contrôles d'autorisation backend ;
- la déclaration mensongère d'une tâche comme terminée ;
- la suppression des tests pour obtenir artificiellement un résultat vert.

## 27. Bloc local facultatif

Chaque dépôt peut ajouter à la fin de ce fichier une section :

## Spécificités du projet

Cette section peut décrire :

- la stack effectivement utilisée ;
- les commandes propres au dépôt ;
- les chemins particuliers ;
- l'infrastructure locale ;
- les services externes ;
- les règles métier ;
- les contraintes de production ;
- les comptes de démonstration ;
- les données seedées ;
- les profils utilisateur ;
- les fichiers devant rester synchronisés ;
- les procédures de déploiement ;
- les exceptions techniques justifiées.

Cette section doit rester limitée aux informations réellement spécifiques au projet.

Toute règle suffisamment générale pour être utile à plusieurs dépôts doit être remontée dans les conventions générales plutôt que dupliquée dans les blocs locaux.

## Spécificités du projet

- **Nature du dépôt.** ATG / Across The Galaxies ("Outerspace, The gamE") :
  ce dépôt contient le site Jekyll historique (vitrine), les documents de
  conception du jeu et, depuis le GO du responsable (2026-07-12, session 30),
  l'application du jeu en construction dans `game/` (monorepo pnpm :
  `shared`, `server`, `client`, `e2e`). Phase P1 entamée.
- **Documents de conception (à la racine, ordre de préséance) :**
  1. `GAME_BOOK.md` — canon des règles (toute contradiction se résout ici d'abord) ;
  2. `GAME_BIBLE.md` — lore et univers ;
  3. `DESIGN_GUIDE.md` — spécification mécanique chiffrée (valeurs `[TUNE]`) ;
  4. `BALANCE_LOG.md` — journal de la boucle d'équilibrage par simulation.
- **Équivalences documentaires (§5) :** `JOURNAL.md` à la racine est
  l'équivalent officiel de `docs/JOURNAL.md` (historique préexistant conservé).
- **Branche de travail.** Exception au §13, sur instruction du responsable via
  l'environnement d'exécution : le travail se fait sur la branche de session
  dédiée (actuellement `claude/game-build-progress-i77mxo` ; historique de
  préproduction : `claude/atg-architecture-brainstorm-hvqn29`), jamais sur
  `main`. Ne pas créer d'autres branches.
- **Langues.** Documents de conception et docs techniques : anglais (continuité
  de l'existant). Messages de commit : français (§13). CLAUDE.md : français.
- **Thème.** Exception documentée au §4 « thème clair » : le jeu utilise un
  **thème sombre** (direction artistique « groovy dark », voir
  `docs/DESIGN_SYSTEM.md`) sur décision du responsable. La charte P2Enjoy reste
  la base chromatique, assombrie.
- **Sous-agents.** Exception ponctuelle au §1 accordée par le responsable pour
  les **simulations d'équilibrage** (campagnes simulées, cf. `BALANCE_LOG.md`)
  uniquement ; tout le reste du travail est séquentiel et direct.
- **Site Jekyll (existant).** Lancement : `bundle install && bundle exec jekyll
  serve`. Le déploiement historique est la branche `gh-pages`.
- **Monétisation.** Fiat uniquement (Stripe), jamais de clé dans le dépôt ;
  variable d'environnement documentée dans le DAT au moment de l'intégration.
- **Prototypage visuel.** Les prototypes d'interface sont générés via l'API
  OpenAI Images (`OPEN_AI_KEY`, variable d'environnement du cloud worker,
  jamais commitée) et archivés dans `docs/design/prototypes/`.
- **Règle de complétude (exigence du responsable — non négociable).**
  Aucun livrable fait « à moitié ». Quand un ensemble est énumérable
  (bâtiments, unités, upgrades, ressources, props, cas de test…), le livrer
  **exhaustivement**, ou lister explicitement et visiblement ce qui manque,
  pourquoi, et quand ce sera couvert. Un « sous-ensemble pragmatique » non
  annoncé est une faute. Toute valeur ou contenu non testé reste `[TUNE]` et
  déclenche un tour d'équilibrage/vérification avant d'être considéré fiable.
  En cas de doute sur le périmètre : demander, jamais réduire en silence.
