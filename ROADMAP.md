# Roadmap

One line per task of the V1 implementation plan, ticked in the commit that delivers it.

- [x] T0 Bootstrap the repository
- [x] T1 Prune the api, kit and app to a green skeleton
- [x] T2 Auth with Google, linked children accounts, tokens sealed at rest
- [x] T3 Module scaffold, event catalog, shared config
- [x] T4 Children module (lien enfants, connexion Classroom)
- [x] T5 Extraction module (port LLM, schema Zod, status à vérifier)
- [x] T6 Agenda module (agrégat Event, liste, filtres, édition, suppression, historique)
- [x] T7 Classroom sync module (client derrière un port, idempotence, tombstones)
- [x] T8 Alerts module (alerte programmable, worker SKIP LOCKED, Web Push VAPID, email de secours)
- [x] T9 RGPD (suppression de compte, révocation)
- [x] T10 Host wiring, workers, SSE, migration
- [x] T11 Front foundation (identité visuelle, shell mobile, PWA, route stubs)
- [x] T12 Front, connexion, ajout d'enfant, écran d'erreur école
- [x] T13 Front, liste des échéances et détail
- [x] T14 Front, édition, suppression, historique
- [x] T15 Front, notifications push, installation, réglages et suppression de compte
- [x] T16 End-to-end proof and quality gate
- [x] T17 Deployment preparation (do not deploy)
- [x] T18 Up to five reminders, by default and per event
- [x] T19a Realistic class template and test classroom provisioning
- [ ] T19 End-to-end run against a real Classroom demo domain
- [ ] T20 Design pass on the parent's criteria
