export default {
  controls: {
    progress: "Étape {{current}} sur {{total}}",
    previous: "Précédent",
    next: "Suivant",
    skip: "Passer",
    finish: "C'est parti",
  },
  home: {
    today: {
      title: "Pour le prochain jour d'école",
      body: "Ce qui tombe demain, enfant par enfant, avec ce qu'il faut préparer. Cochez sans quitter l'accueil.",
    },
    week: {
      title: "Votre calendrier",
      body: "Les échéances de vos enfants jour par jour. Cochez ce qui est fait, touchez une échéance pour le détail.",
    },
    family: {
      title: "Un enfant à la fois",
      body: "Chaque enfant a sa couleur. Choisissez-en un pour ne voir que ses échéances.",
    },
    tabs: {
      title: "Semaine ou mois",
      body: "La semaine montre les sept jours à venir, le mois la vue d'ensemble. Glissez pour passer à la période suivante.",
    },
    share: {
      title: "Ajouter, partager, s'abonner",
      body: "Ajoutez ce que l'école n'a pas publié, partagez la semaine ou abonnez votre agenda.",
    },
    edit: {
      title: "Votre accueil, à votre façon",
      body: "Déplacez, agrandissez ou masquez les blocs. Votre disposition vous suit sur tous vos appareils.",
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
    notifications: {
      title: "Vos alertes",
      body: "Activez les notifications sur ce téléphone et choisissez vos rappels par défaut.",
    },
    account: {
      title: "Vos appareils",
      body: "Voyez où vous êtes connecté et déconnectez un appareil oublié.",
    },
    help: {
      title: "Revoir la visite",
      body: "Relancez cette visite quand vous voulez, depuis l'aide.",
    },
  },
} as const;
