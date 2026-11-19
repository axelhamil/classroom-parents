# Analyse d'impact (AIPD) : fonctions d'IA de KeepUpKids

Trame sur la grille de la fiche pratique CNIL n° 5 sur l'IA (« Réaliser une analyse d'impact si nécessaire »). Version 0.1 du 19 novembre 2026, rédigée avec la tâche 5 (`feat(assistant)`).

**Obligation** : AIPD complétée et validée **avant la fusion de la tâche 7** (lecture de photos et de PDF). Aucune photo d'un document d'enfant n'est envoyée au modèle avant.

| Champ | Valeur |
|---|---|
| Responsable du traitement | l'éditeur de KeepUpKids |
| DPO ou référent | `[à compléter]` |
| Avis du DPO | `[à compléter]` |
| Avis des personnes concernées ou de leurs représentants | `[à compléter]` (panel de parents du pilote) |
| Validation | `[à compléter]` (nom, date) |
| Prochaine revue | `[à compléter]`, et à chaque nouvelle fonction d'IA, nouveau modèle ou nouveau sous-traitant |

## 1. Pourquoi une AIPD

Critères de la liste CNIL (lignes directrices du CEPD) réunis, deux suffisent :

- **Personnes vulnérables** : données d'élèves mineurs (annonces de classe, documents scolaires, écriture d'enfant sur une photo).
- **Usage innovant de technologies** : modèle de langage généraliste fourni par un tiers.
- Partiellement, **croisement de sources** : Classroom, documents du parent, préférences.

## 2. Description du traitement

| Fonction | Déclenchement | Ce qui part chez Anthropic | Finalité |
|---|---|---|---|
| Lecture des annonces (+ argent, documents, objets à apporter) | synchronisation, sans geste | texte de l'annonce minimisé, date de publication, fuseau | tirer les échéances |
| Ajout depuis une photo, un PDF, un texte partagé | geste du parent | image ré-encodée ou PDF, sans EXIF | proposer des échéances à valider |
| Ajout en langage naturel | geste du parent, si l'analyseur déterministe échoue | phrase saisie, prénoms remplacés | proposer une échéance à valider |
| Traduire ou simplifier | geste du parent | texte de l'annonce relu à la demande | afficher une traduction à côté de l'original |

Hors IA : devoirs Classroom, résumé de la semaine, charge, checklist, plan de révision (calculs et modèles de phrases).

Sous-traitant : Anthropic, PBC (API Claude, modèles Haiku et Sonnet), sans outil, sans mémoire, sans accès réseau côté modèle.

## 3. Données et personnes concernées

| Personnes | Données | Source |
|---|---|---|
| Élève mineur | prénom (remplacé par `[ENFANT_N]` avant envoi), contenu des annonces de sa classe, documents scolaires, écriture manuscrite sur photo | Classroom (lecture seule), parent |
| Parent | préférences (langue, fuseau, pays, lecture IA des annonces), compteurs d'usage, journal technique | application |
| Tiers (enseignant, autres élèves) | noms, e-mails, téléphones, liens présents dans une annonce ou un document | Classroom, parent |

Jamais envoyés : nom de famille, identifiant Google, notes, jetons d'accès.

## 4. Nécessité et proportionnalité

- **Déterministe d'abord** : tout ce qu'un calcul ou un modèle de phrase fait ne passe pas par l'IA ; un préfiltre écarte les annonces sans date possible.
- **Un appel par contenu** : une annonce lue une fois, résultat partagé par les familles qui la lisent déjà.
- **Minimisation** : prénoms en `[ENFANT_N]`, e-mails, téléphones, liens et numéros longs retirés avant envoi.
- **Aucune conservation des fichiers** ; texte complet des annonces jamais stocké.
- **Aucune inférence sur l'enfant** (note, difficulté, profil) ; le plan de révision espace des rappels sans évaluer l'apprentissage (hors annexe III point 3 de l'AI Act).

## 5. Base légale

| Traitement | Base | Mise en œuvre |
|---|---|---|
| Lecture des annonces | exécution du service (art. 6.1.b) | opposition réelle : Réglages, « Lecture des annonces par l'IA » désactivée = seuls les devoirs restent lus, plus aucune annonce envoyée |
| Documents, langage naturel, traduction | exécution du service, à la demande | geste du parent, information au moment de l'envoi |
| Quotas, journal, coupe-circuit | intérêt légitime (art. 6.1.f) | sécurité, coût, prévention des abus |

## 6. Durées de conservation

| Donnée | Durée | Effacée avec le compte | Dans la copie remise au parent |
|---|---|---|---|
| Fichiers partagés | aucune | sans objet | non |
| Phrase citée (≤ 300 car.) | celle de l'échéance | oui | oui |
| Cache d'extraction partagé (clé : SHA-256 du texte, date, fuseau, version du prompt) | 60 jours sans lecture | non : aucune donnée de la famille, aucun lien au compte | non |
| Journal `ai_call` (fonction, modèle, coût, issue, empreinte de l'entrée) | 90 jours | oui | oui : date, fonction, modèle, tokens, coût, issue (ni empreinte ni version du prompt) |
| Compteurs `ai_usage` (mois, fonction, appels, escalades, coût) | 13 mois | oui | oui |
| Préférences | durée du compte | oui | oui |
| Chez Anthropic | rétention zéro (ZDR) demandée, ni Batch ni Files API | sans objet | sans objet |

## 7. Sous-traitants et transferts hors UE

- Anthropic, PBC (États-Unis) : clauses contractuelles types, aucun entraînement sur les entrées, ZDR confirmée par écrit (`docs/DEPLOY.md`, étape 8). Statut ZDR : `[à compléter]` (date de la confirmation).
- Registre : `apps/app/src/shared/sub-processors.config.ts`, page publique `/legal/sub-processors`.
- Analyse du transfert (accès des autorités américaines) : `[à compléter]`.

## 8. Droits des personnes

- Information : politique de confidentialité (section IA), mention au moment de l'envoi, marquage `aiGenerated` (AI Act art. 50).
- Opposition : réglage de lecture des annonces ; fonctions à la demande non utilisées = aucun envoi.
- Accès et portabilité : copie des données du compte (préférences, compteurs, échéances et phrases citées).
- Effacement : suppression du compte, cascade sur les tables du parent ; le cache partagé n'en contient aucune.
- Rectification : toute échéance est éditable, une édition du parent n'est jamais écrasée.

## 9. Risques et mesures

Échelle CNIL : négligeable, limitée, importante, maximale.

| Risque pour les personnes | Vraisemblance | Gravité | Mesures |
|---|---|---|---|
| Fuite de données d'un mineur chez le fournisseur | limitée | importante | minimisation avant envoi, ZDR, fichiers jamais stockés, journal sans contenu |
| Une famille voit les données d'une autre | négligeable | importante | cache partagé sans donnée de famille, lu seulement avec l'empreinte d'un texte que cette famille vient de lire ; ownership dans le `WHERE` ; aucun contexte de famille dans le prompt |
| Injection dans une annonce ou un document qui fausse une échéance ou déclenche une action | limitée | limitée | normalisation Unicode (tags, bidi, largeur nulle), données entre balises à nonce, instructions seulement en `system`, aucun outil, sorties en schéma strict, citations vérifiées, `injectionSuspected` → à vérifier, validation du parent, red team ≥ 60 cas bloquant en CI |
| Contenu malveillant affiché au parent (lien, HTML) | limitée | limitée | rendu texte seul, aucun champ URL ni HTML dans les schémas, règle lint contre `dangerouslySetInnerHTML` |
| Échéance fausse ou manquée | importante | limitée | marquée « à vérifier » avec la phrase source, Classroom reste la référence (conditions d'utilisation), éval bloquante (rappel et précision ≥ 94 %) |
| Profilage ou décision sur l'enfant | négligeable | importante | aucune inférence, aucune table de conversation ni mémoire longue |
| Dérive de coût menant à une coupure brutale ou à un usage abusif | limitée | négligeable | quotas mensuels par famille, plafond global par jour (`AI_DAILY_SPEND_CAP_USD`), coupe-circuit fournisseur, alertes opérateur (`AI_ALERT_EMAIL`) |
| Lecture d'écriture d'enfant sur photo (tâche 7) | `[à compléter]` | `[à compléter]` | ré-encodage, EXIF retiré, signature de fichier vérifiée, 8 Mo, 3 images ou 10 pages, toute échéance en revue |

Risques résiduels et acceptation : `[à compléter]`.

## 10. Plan d'action avant validation

- [ ] ZDR confirmée par écrit et archivée.
- [ ] Analyse du transfert vers les États-Unis.
- [x] Journal `ai_call` inclus dans la copie remise au parent (arbitrage du 19/11/2026).
- [ ] Section photos (tâche 7) complétée, avec l'éval photos et PDF et ses cas adversariaux.
- [ ] Avis du DPO et validation datée.
