export default {
  school: {
    title: "Faire autoriser l'application par l'école",
    description:
      "Quelques minutes de votre côté, une case à cocher pour l'école, et les échéances de votre enfant arrivent ici.",
    why: {
      title: "Pourquoi c'est bloqué",
      body: "Les comptes Google des élèves appartiennent à l'établissement, qui choisit les applications autorisées à les lire ; pour les moins de 18 ans, toute application non encore autorisée est bloquée par défaut. Vous ne pouvez pas lever ce blocage vous-même : seul l'administrateur Google de l'école le peut, en deux minutes.",
    },
    steps: {
      title: "Ce que vous devez faire",
      contact: {
        title: "Trouver la bonne personne",
        body: "Au collège ou au lycée, écrivez au référent numérique ou à l'administrateur de l'ENT, via le secrétariat si besoin. En primaire, adressez-vous au directeur ou à la directrice, qui transmettra à la mairie ou à la circonscription.",
      },
      send: {
        title: "Envoyer la demande",
        body: "Le message ci-dessous contient tout ce dont l'administrateur a besoin. Relisez-le, ajoutez le nom de l'élève si vous le souhaitez, puis envoyez-le.",
      },
      back: {
        title: "Revenir ici",
        body: "Quand l'école confirme, reconnectez le compte de votre enfant depuis la page Enfants. Le changement peut prendre jusqu'à 24 heures côté Google.",
        action: "Voir mes enfants",
      },
    },
    message: {
      title: "Votre message à l'école",
      description: "Modifiez-le librement avant de l'envoyer.",
      label: "Message à envoyer",
      loading: "Préparation du message…",
      loadError: "Le message n'a pas pu être préparé.",
      retry: "Réessayer",
      copy: "Copier",
      open: "Ouvrir dans ma messagerie",
      copied: "Message copié, collez-le dans votre e-mail à l'école.",
      copyFailed: "Impossible de copier le message. Sélectionnez le texte pour le copier.",
      subject: "Demande d'autorisation de l'application {{brand}} pour les comptes élèves",
      body: {
        greeting: "Bonjour,",
        request:
          "Parent d'élève, j'utilise {{brand}} pour suivre les devoirs et les échéances de mon enfant publiés dans Google Classroom. Le compte Google de l'établissement bloque pour l'instant cette application. Pourriez-vous l'autoriser pour les comptes élèves ?",
        steps:
          "Dans la console d'administration Google : Sécurité > Contrôle des accès et des données > Commandes des API > Gérer l'accès des applications > Configurer une nouvelle application, puis rechercher l'ID client ci-dessous et choisir l'accès « Données Google spécifiques » (ou « Approuvée ») pour l'unité organisationnelle des élèves.",
        clientId: "ID client OAuth : {{clientId}}",
        scopes: "Autorisations demandées, toutes en lecture seule :",
        scope: "- {{scope}}",
        readOnly:
          "L'application ne fait que lire : elle n'écrit, ne publie et ne modifie jamais rien dans Classroom. Pour ces données de mineurs, elle ne garde que le titre, le type et la date de chaque échéance, sans publicité ni revente, et le parent peut tout effacer à tout moment.",
        guide: "Guide pas à pas pour l'administrateur : {{url}}",
        privacy: "Politique de confidentialité : {{url}}",
        subProcessors: "Sous-traitants : {{url}}",
        thanks: "Merci beaucoup,",
      },
    },
  },
} as const;
