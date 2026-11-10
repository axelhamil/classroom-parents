export default {
  list: {
    title: "Enfants",
    description: "Les comptes Google Classroom de vos enfants, en lecture seule.",
    add: "Ajouter un enfant",
    loading: "Chargement des enfants…",
    emptyTitle: "Aucun enfant relié pour l'instant",
    emptyDescription:
      "Reliez le compte Google Classroom de votre enfant pour voir ses échéances ici.",
    reconnecting: "Reconnexion du compte…",
    reconnected: "Le compte de {{label}} est de nouveau relié.",
  },
  status: {
    connected: "Relié",
    needs_reconnect: "À reconnecter",
    blocked_by_school: "Bloqué par l'école",
    disconnecting: "Déconnexion en cours",
  },
  card: {
    lastSynced: "Dernière lecture de Classroom : {{date}}",
    neverSynced: "Pas encore lu",
    syncing: "Lecture de Classroom en cours…",
    disconnectingHint: "Nous retirons l'accès Google et supprimons ses données.",
    rename: "Renommer",
    disconnect: "Déconnecter",
  },
  reconnect: {
    needsReconnect:
      "Google ne donne plus accès à ce compte. Reconnectez-le pour continuer à recevoir ses échéances.",
    afterSchool: "Une fois l'application autorisée par l'école, reconnectez le compte.",
    action: "Reconnecter",
    pending: "Ouverture de Google…",
    failed: "Google n'a pas pu être ouvert. Réessayez.",
  },
  disconnect: {
    title: "Déconnecter {{label}} ?",
    description:
      "Nous retirons l'accès Google de l'application pour ce compte, puis supprimons ses échéances et ses rappels. Classroom n'est pas modifié. Cette action est définitive.",
    confirm: "Déconnecter",
    cancel: "Annuler",
    done: "{{label}} est déconnecté.",
    failed: "La déconnexion n'a pas abouti. Réessayez.",
  },
  rename: {
    title: "Renommer",
    description: "Le prénom affiché sur les échéances. Seul vous le voyez.",
    label: "Prénom affiché",
    submit: "Enregistrer",
    pending: "Enregistrement…",
    cancel: "Annuler",
    done: "Prénom enregistré.",
    failed: "Le prénom n'a pas pu être enregistré. Réessayez.",
  },
  new: {
    title: "Ajouter un enfant",
    description: "Reliez le compte Google Classroom de votre enfant pour lire ses annonces.",
    readOnlyTitle: "Ce que l'application lit",
    readOnlyCourses: "La liste de ses cours.",
    readOnlyAnnouncements: "Les annonces et les devoirs publiés par ses professeurs.",
    readOnlyNever:
      "Rien n'est jamais écrit dans Classroom : ni message, ni devoir rendu, ni modification.",
    start: "Ajouter le compte Google de mon enfant",
    starting: "Ouverture de Google…",
    hint: "Sur la page Google, choisissez le compte de l'élève, pas le vôtre.",
    checking: "Vérification du compte Google…",
    registering: "Ajout de {{email}}…",
    pickTitle: "Quel compte ajouter ?",
    pickDescription: "Plusieurs comptes Google sont reliés. Choisissez celui de l'élève.",
    noneTitle: "Aucun nouveau compte à ajouter",
    noneDescription:
      "Ce compte Google est peut-être déjà relié. Recommencez en choisissant le compte de l'élève.",
    retry: "Recommencer avec un autre compte",
    discard: "Retirer ce lien et recommencer",
    toChildren: "Voir mes enfants",
  },
  firstSync: {
    title: "Compte relié",
    running: "Lecture des annonces de la classe. Cela prend en général moins de 3 minutes.",
    done: "C'est prêt.",
    firstEvent: "Première échéance : {{title}}",
    noEvent:
      "Aucune échéance à venir pour l'instant. Vous serez prévenu dès qu'une annonce en contient une.",
    toEvents: "Voir les échéances",
    addAnother: "Ajouter un autre enfant",
  },
  linkError: {
    title: "Connexion refusée",
    description: "Le compte de votre enfant n'a pas pu être relié.",
    kinds: {
      already_linked: "Ce compte Google est déjà relié à un autre compte de l'application.",
      link_refused:
        "Ce compte Google n'a pas pu être relié. Réessayez en choisissant le compte de l'élève.",
    },
    retry: "Réessayer",
  },
  school: {
    title: "Ce que l'école doit faire",
    kinds: {
      admin_blocked:
        "L'administrateur de l'école a bloqué cette application. Contactez l'établissement avec ce guide.",
      not_configured: "L'école n'a pas encore configuré l'application. Transmettez-lui ce guide.",
      access_denied:
        "L'établissement de votre enfant doit autoriser l'application. Appuyez sur « Demander l'accès » sur la page Google, puis envoyez ce guide à l'école. Si vous avez simplement refusé l'accès, réessayez.",
      unknown:
        "Google n'a pas relié le compte. Réessayez ; si le blocage continue, transmettez ce guide à l'école.",
    },
    steps: {
      console:
        "Ouvrir la console d'administration Google (admin.google.com) avec un compte administrateur.",
      path: "Aller dans Sécurité, puis Contrôle des accès et des données, puis Contrôles des API.",
      pending:
        "Ouvrir « Applications en attente de revue » et rechercher l'application par son ID client.",
      configure:
        "Choisir « Configurer l'accès », puis autoriser l'accès aux données Google limité aux autorisations ci-dessous.",
    },
    clientId: "ID client",
    scopes: "Autorisations en lecture seule",
    share: "Partager avec l'école",
    shareTitle: "Autoriser l'application pour les parents",
    shareStep: "{{index}}. {{step}}",
    shareClientId: "ID client : {{clientId}}",
    shareScopes: "Autorisations en lecture seule :",
    shareScope: "- {{scope}}",
    copied: "Procédure copiée, collez-la dans votre message à l'école.",
    copyFailed: "Impossible de copier la procédure. Sélectionnez le texte pour le copier.",
  },
} as const;
