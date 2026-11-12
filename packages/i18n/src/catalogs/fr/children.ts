export default {
  list: {
    title: "Enfants",
    description: "Les comptes Google Classroom de vos enfants, en lecture seule.",
    add: "Ajouter un enfant",
    loading: "Chargement des enfants…",
    emptyTitle: "Aucun enfant relié pour l'instant",
    emptyDescription:
      "Reliez le compte Google Classroom de votre enfant pour voir ses échéances ici.",
    emptyAction: "Relier mon premier enfant",
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
    actions: "Actions pour {{label}}",
    rename: "Renommer",
    sync: "Synchroniser",
    disconnect: "Déconnecter",
    toEvents: "Voir ses échéances",
  },
  sync: {
    started: "Lecture de Classroom lancée pour {{label}}.",
    failed: "La lecture de Classroom n'a pas pu être lancée. Réessayez.",
  },
  reconnect: {
    needsReconnectTitle: "Accès Google perdu",
    afterSchoolTitle: "Après l'accord de l'école",
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
  linkError: {
    title: "Connexion refusée",
    description: "Le compte de votre enfant n'a pas pu être relié.",
    kinds: {
      already_linked: "Ce compte Google est déjà relié à un autre compte de l'application.",
      link_refused:
        "Ce compte Google n'a pas pu être relié. Réessayez en choisissant le compte de l'élève.",
    },
    retry: "Réessayer",
    toChildren: "Voir mes enfants",
  },
  school: {
    title: "Ce que l'école doit faire",
    intro: "Transmettez ces étapes à l'administrateur informatique de l'école.",
    stepTitles: {
      console: "Ouvrir la console d'administration",
      path: "Aller aux contrôles des API",
      pending: "Retrouver l'application",
      configure: "Autoriser l'accès en lecture",
    },
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
