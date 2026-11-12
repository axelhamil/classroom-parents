export default {
  controls: {
    progress: "Étape {{current}} sur {{total}}",
    previous: "Précédent",
    next: "Suivant",
    skip: "Passer",
    finish: "C'est parti",
  },
  home: {
    week: {
      title: "Votre calendrier",
      body: "Les échéances de vos enfants jour par jour. Cochez ce qui est fait, touchez une échéance pour le détail.",
    },
    family: {
      title: "Un enfant à la fois",
      body: "Chaque enfant a sa couleur. Choisissez-en un pour ne voir que ses échéances.",
    },
    tabs: {
      title: "Agenda, Semaine, Mois",
      body: "Changez de vue sans perdre le jour choisi. Glissez pour passer à la période suivante.",
    },
    share: {
      title: "Ajouter, partager, s'abonner",
      body: "Ajoutez ce que l'école n'a pas publié, partagez la semaine ou abonnez votre agenda.",
    },
    nav: {
      title: "Tout est ici",
      body: "Accueil pour le calendrier, Enfants pour les comptes, Réglages pour les alertes.",
    },
  },
  "event-detail": {
    when: {
      title: "Pour quand",
      body: "La date limite et le temps qu'il reste, en un coup d'œil.",
    },
    prepare: {
      title: "À préparer",
      body: "Cochez ce qui est prêt. Ajoutez vos propres choses à ne pas oublier.",
    },
    agenda: {
      title: "Dans votre agenda",
      body: "Ajoutez l'échéance à votre agenda ou partagez-la.",
    },
    reminders: {
      title: "Vos rappels",
      body: "Choisissez quand être prévenu pour cette échéance.",
    },
  },
  children: {
    card: {
      title: "La carte de votre enfant",
      body: "Son compte Classroom, l'état de la connexion et la dernière lecture.",
    },
    menu: {
      title: "Renommer ou relire",
      body: "Ce menu permet de renommer, relancer la lecture ou déconnecter le compte.",
    },
    add: {
      title: "Un autre enfant ?",
      body: "Ajoutez le compte Classroom d'un frère ou d'une sœur.",
    },
  },
  settings: {
    push: {
      title: "Les alertes sur ce téléphone",
      body: "Activez les notifications pour être prévenu avant chaque échéance.",
    },
    reminders: {
      title: "Vos rappels par défaut",
      body: "Ils s'appliquent à chaque nouvelle échéance. Vous pouvez les changer au cas par cas.",
    },
    devices: {
      title: "Vos appareils",
      body: "Voyez où vous êtes connecté et déconnectez un appareil oublié.",
    },
    tour: {
      title: "Revoir la visite",
      body: "Relancez cette visite quand vous voulez, depuis ici.",
    },
  },
} as const;
