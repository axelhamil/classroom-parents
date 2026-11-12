export default {
  list: {
    title: "Échéances",
    today: "Aujourd'hui",
    loading: "Chargement des échéances",
    loadError: "Les échéances n'ont pas pu être chargées.",
    retry: "Réessayer",
    more: "Afficher les suivantes",
  },
  filters: {
    category: "Filtrer par type",
    child: "Filtrer par enfant",
    allCategories: "Tout",
    allChildren: "Tous les enfants",
  },
  empty: {
    noChild: {
      title: "Aucun enfant relié",
      description: "Reliez le compte Classroom de votre enfant pour voir ses échéances ici.",
      action: "Ajouter un enfant",
    },
    syncing: {
      title: "Première lecture de Classroom",
      description:
        "L'analyse en cours des annonces peut prendre quelques minutes. Les échéances apparaîtront ici d'elles-mêmes.",
    },
    nothing: {
      title: "Rien à préparer",
      description: "Aucune échéance à venir. Les nouvelles annonces de Classroom arriveront ici.",
      action: "Voir mes enfants",
    },
    filtered: {
      title: "Rien pour ce filtre",
      description: "Aucune échéance à venir ne correspond à ce choix.",
      action: "Tout afficher",
    },
  },
  blocked: {
    titles: {
      needs_reconnect: "Classroom n'est plus lu pour {{child}}",
      blocked_by_school: "L'école de {{child}} bloque la lecture de Classroom",
    },
    descriptions: {
      needs_reconnect: "Reconnectez son compte Google pour recevoir à nouveau ses échéances.",
      blocked_by_school:
        "Ses échéances ne sont plus mises à jour tant que l'établissement n'autorise pas l'application.",
    },
    action: "Voir les enfants",
  },
  countdown: {
    tonight: "Ce soir",
    inDays_one: "Dans {{count}} jour",
    inDays_other: "Dans {{count}} jours",
  },
  review: {
    title: "À vérifier",
    description:
      "Ces dates ont été lues avec un doute. Confirmez-les pour programmer leurs rappels.",
    confirm: "C'est bon",
    edit: "Modifier",
    confirmed: "Échéance confirmée",
  },
  categories: {
    assessment: "Évaluation",
    homework: "Devoir",
    school_trip: "Sortie scolaire",
    swimming: "Piscine",
    document_due: "Document à rendre",
  },
  sources: {
    announcement: "Annonce",
    coursework: "Devoir",
  },
  detail: {
    title: "Échéance",
    loading: "Chargement de l'échéance",
    deadline: "Pour le",
    received: "Reçue le",
    child: "Enfant",
    description: "Ce qu'en dit l'annonce",
    openInClassroom: "Ouvrir dans Classroom",
    edit: "Modifier",
    back: "Retour aux échéances",
    notFound: {
      title: "Échéance introuvable",
      description: "Elle a peut-être été supprimée ou la date est déjà passée.",
    },
  },
  reminders: {
    title: "Rappels",
    loading: "Chargement des rappels",
    loadError: "Impossible de charger les rappels.",
    fromDefaults: "Vos rappels par défaut, réglables dans Réglages.",
    customized: "Rappels choisis pour cette échéance.",
    none: "Aucun rappel pour cette échéance.",
    due: "Envoi : {{when}}",
    edit: "Modifier les rappels",
    reset: "Revenir aux rappels par défaut",
    saved: "Rappels enregistrés",
    restored: "Rappels par défaut rétablis",
    dropped_one:
      "Un de vos rappels par défaut ne peut pas sonner avant cette échéance : il n'est pas repris.",
    dropped_other:
      "{{count}} de vos rappels par défaut ne peuvent pas sonner avant cette échéance : ils ne sont pas repris.",
    awaitingReview:
      "Vos rappels par défaut seront programmés quand vous aurez confirmé cette échéance. Ceux que vous choisissez pour elle sont programmés tout de suite.",
    statuses: {
      pending: "Planifié",
      sent: "Envoyé",
      skipped: "Sauté",
      missed: "Non envoyé",
      unplanned: "Non planifié",
    },
  },
  delete: {
    trigger: "Supprimer",
    title: "Supprimer cette échéance ?",
    description:
      "« {{title}} » disparaîtra de la liste et ne reviendra pas à la prochaine lecture de Classroom. Ses rappels sont annulés.",
    action: "Supprimer",
    cancel: "Garder",
    done: "Échéance supprimée",
  },
} as const;
