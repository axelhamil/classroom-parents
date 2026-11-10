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
    },
    filtered: {
      title: "Rien pour ce filtre",
      description: "Aucune échéance à venir ne correspond à ce choix.",
      action: "Tout afficher",
    },
  },
  blocked: {
    needs_reconnect: "La lecture de Classroom est arrêtée pour {{child}} : reconnectez son compte.",
    blocked_by_school:
      "L'établissement de {{child}} bloque la lecture de Classroom : ses échéances ne sont plus mises à jour.",
    action: "Voir les enfants",
  },
  review: {
    title: "À vérifier",
    description: "Ces dates ont été lues avec un doute. Confirmez-les pour programmer le rappel.",
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
  alert: {
    title: "Rappel",
    default: "Rappel 2 jours avant, 18 h",
    custom: "Rappel le {{date}} à {{time}}",
    none: "Pas de rappel programmé",
    loading: "Chargement du rappel",
    change: "Changer",
    add: "Programmer un rappel",
    reset: "Retirer mon rappel",
    loadError: "Impossible de charger le rappel.",
    date: "Jour",
    time: "Heure",
    save: "Enregistrer",
    cancel: "Annuler",
    saved: "Rappel programmé",
    restored: "Rappel par défaut rétabli",
    removed: "Rappel retiré : le rappel par défaut est déjà passé",
  },
  delete: {
    trigger: "Supprimer",
    title: "Supprimer cette échéance ?",
    description:
      "« {{title}} » disparaîtra de la liste et ne reviendra pas à la prochaine lecture de Classroom. Son rappel est annulé.",
    action: "Supprimer",
    cancel: "Garder",
    done: "Échéance supprimée",
  },
} as const;
