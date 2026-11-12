export default {
  brand: "Échéances Classroom",
  deadline: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    dateWithTime: "{{date}}, {{time}}",
    hours: "{{hours}} h",
    hoursMinutes: "{{hours}} h {{minutes}}",
  },
  reminders: {
    sameDay: "Le jour même, à {{time}}",
    dayBefore: "La veille, à {{time}}",
    daysBefore: "{{days}} jours avant, à {{time}}",
    hoursBefore_one: "{{count}} heure avant",
    hoursBefore_other: "{{count}} heures avant",
    item: "Rappel {{number}}",
    kind: "Quand",
    kinds: {
      days_before: "Un jour donné, à une heure",
      hours_before: "Quelques heures avant",
    },
    days: "Jours avant",
    time: "Heure",
    hours: "Heures avant",
    add: "Ajouter un rappel",
    remove: "Retirer le rappel {{number}}",
    full: "5 rappels au maximum",
    empty: "Aucun rappel : rien ne sera envoyé.",
    hoursNeedTime: "Cette échéance n'a pas d'heure : choisissez des rappels en jours.",
  },
  deletionBanner: {
    title: "Votre compte va être supprimé",
  },
  queryState: {
    loadError: "Le chargement n'a pas abouti. Vérifiez la connexion, puis réessayez.",
  },
  actions: {
    save: "Enregistrer",
    cancel: "Annuler",
    close: "Fermer",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
    retry: "Réessayer",
    reload: "Recharger",
  },
  roles: {
    owner: "Propriétaire",
    admin: "Administrateur",
    member: "Membre",
  },
  nav: {
    label: "Navigation principale",
    home: "Accueil",
    children: "Enfants",
    settings: "Réglages",
  },
  errorBoundary: {
    title: "Une erreur est survenue",
    body: "Cette page n'a pas pu se charger. Essayez de la recharger.",
  },
  notFound: {
    title: "Page introuvable",
    description:
      "Cette page n'existe pas ou a été déplacée. Vérifiez l'adresse, ou revenez à l'accueil.",
    backHome: "Revenir à l'accueil",
  },
  orgSwitcher: {
    searchPlaceholder: "Rechercher une organisation...",
    noResults: "Aucune organisation trouvée.",
    heading: "Organisations",
    newOrganization: "Nouvelle organisation",
    selectPlaceholder: "Sélectionner une organisation",
    switchFailed: "Échec du changement d'organisation",
  },
  developers: {
    eventsTitle: "Catalogue des événements",
    eventsIntro:
      "Tous les événements auxquels il est possible de s'abonner sur cette plateforme. Abonnez-vous à l'un d'eux depuis un point de terminaison webhook dans les paramètres de votre organisation.",
    eventsEnglishNote:
      "Les noms d'événements et leurs descriptions font partie de la référence de l'API et restent en anglais.",
  },
  userMenu: {
    openMenu: "Ouvrir le menu utilisateur",
    account: "Compte",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    signedOutToast: "Déconnexion effectuée",
    signOutFailed: "Échec de la déconnexion",
  },
  impersonation: {
    activeSession:
      "Session d'emprunt d'identité active : agit en tant que <name>{{name}}</name>. {{remaining}}. Les modifications sont bloquées pendant cette session.",
    remainingMinutes: "{{minutes}} min restantes",
    expired: "session expirée",
    end: "Arrêter l'emprunt d'identité",
    actionUnavailable: "Indisponible pendant l'emprunt d'identité.",
  },
  cookieBanner: {
    ariaLabel: "Consentement aux cookies",
    message:
      "Nous utilisons des cookies pour faire fonctionner ce service. Les cookies optionnels aident à améliorer votre expérience.",
    policyLink: "Politique cookies",
    rejectAll: "Tout refuser",
    customize: "Personnaliser",
    acceptAll: "Tout accepter",
    preferencesTitle: "Préférences cookies",
  },
  legal: {
    policies: {
      privacyTitle: "Politique de confidentialité",
      termsTitle: "Conditions d'utilisation",
      versionLine: "Version {{version}} (en vigueur le {{date}})",
      updated: "Dernière mise à jour : 10 novembre 2026",
    },
    accessibility: {
      title: "Déclaration d'accessibilité",
      subtitle: "RGAA 4.1 et WCAG 2.1 niveau AA · Dernière mise à jour : 10 novembre 2026",
    },
    cookies: {
      title: "Cookies",
      subtitle: "Uniquement les cookies nécessaires · Dernière mise à jour : 10 novembre 2026",
      tableCaption: "Cookies déposés par l'application",
      table: {
        name: "Nom",
        provider: "Fournisseur",
        purpose: "Finalité",
        retention: "Conservation",
      },
    },
    dataRights: {
      title: "Vos droits sur vos données",
      subtitle: "RGPD articles 13 à 21 · Dernière mise à jour : 10 novembre 2026",
    },
    subProcessors: {
      title: "Registre des sous-traitants",
      subtitle: "RGPD article 28 · Dernière mise à jour : 10 novembre 2026",
      tableCaption: "Prestataires qui traitent des données pour faire fonctionner le service",
      table: {
        name: "Nom",
        purpose: "Finalité",
        region: "Région / base de transfert",
        dpa: "Accord de traitement",
      },
      dpaLink: "Lire l'accord",
      noDpa: "Conditions générales du prestataire",
      google: {
        purpose:
          "Connexion avec Google, lecture seule des cours, annonces et devoirs Google Classroom",
        region: "États-Unis (certifié EU DPF)",
      },
      anthropic: {
        purpose: "Extraction des dates dans le texte des annonces, sans entraînement des modèles",
        region: "États-Unis (clauses contractuelles types)",
      },
      resend: {
        purpose:
          "Envoi des e-mails, dont les alertes quand aucun appareil ne reçoit les notifications",
        region: "États-Unis (certifié EU DPF)",
      },
      railway: {
        purpose: "Hébergement de l'application, de ses tâches de fond et de sa base de données",
        region: "Union européenne (région choisie au déploiement)",
      },
    },
    accept: {
      title: "Avant de commencer",
      titleReacceptance: "Politiques mises à jour",
      subtitle:
        "Merci de consulter et d'accepter notre politique de confidentialité et nos conditions d'utilisation pour continuer.",
      subtitleReacceptance:
        "Nous avons mis à jour nos politiques. Merci de consulter les changements et de les accepter pour continuer.",
      updatedBadge: "Mise à jour",
      readFull: "Lire « {{title}} » en intégralité",
      acceptButton: "Accepter et continuer",
      acceptingButton: "Acceptation…",
      declineButton: "Refuser et se déconnecter",
      loadFailed:
        "Les politiques à accepter n'ont pas pu être chargées. Réessayez, ou déconnectez-vous et revenez plus tard.",
    },
    routes: {
      dataRights: "Droits sur les données (RGPD)",
      privacyPolicy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
      subProcessors: "Sous-traitants (RGPD Art. 28)",
      accessibility: "Déclaration d'accessibilité (EAA Art. 14)",
      cookies: "Politique de cookies (CNIL)",
    },
  },
  policyAcceptance: {
    acceptedToast: "Documents acceptés, bienvenue !",
    acceptFailed: "Impossible d'enregistrer votre acceptation. Veuillez réessayer.",
  },
  legalFooter: {
    ariaLabel: "Légal",
  },
  clipboard: {
    copied: "Copié dans le presse-papiers : {{label}}",
    copyLabel: "Copier : {{label}}",
  },
  secretReveal: {
    title: "Secret de signature",
    description:
      "Copiez-le maintenant : il ne s'affiche qu'une seule fois et ne pourra plus être récupéré.",
    secretLabel: "Secret",
    confirm: "Je l'ai enregistré",
  },
  theme: {
    switchToLight: "Passer au thème clair",
    switchToDark: "Passer au thème sombre",
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Tout marquer comme lu",
    nothingToMarkRead: "Aucune notification non lue.",
    empty: "Vous êtes à jour.",
    unreadNone: "Notifications, aucune non lue",
    unreadLabel_one: "Notifications, {{count}} non lue",
    unreadLabel_other: "Notifications, {{count}} non lues",
    andMore: "et {{count}} de plus",
    newBadge: "Nouveau",
    loadMore: "Charger plus",
    loadingMore: "Chargement…",
    categories: {
      security: "Sécurité",
      org: "Organisation",
      billing: "Facturation",
      activity: "Activité",
      unknown: "Autre",
    },
  },
  orgNew: {
    title: "Créer une organisation",
    subtitle: "Démarrez un nouvel espace de travail pour votre équipe.",
    nameLabel: "Nom",
    namePlaceholder: "Acme",
    createdToast: "Organisation créée",
    createFailed: "Échec de la création de l'organisation",
  },
  invitation: {
    signInTitle: "Connectez-vous pour accepter",
    signInBody:
      "Connectez-vous ou créez un compte avec l'adresse e-mail invitée pour accepter cette invitation.",
    createAccount: "Créer un compte",
    joinTitle: "Rejoindre l'organisation",
    signedInAs:
      "Session en cours avec {{email}}. Si ce n'est pas le bon compte, déconnectez-vous et reconnectez-vous avec l'adresse e-mail invitée.",
    acceptInvitation: "Accepter l'invitation",
    acceptedToast: "Invitation acceptée",
    acceptFailed: "Échec de l'acceptation de l'invitation",
  },
  states: {
    endpoint: {
      active: "Actif",
      paused: "En pause",
      autoDisabled: "Désactivé automatiquement",
    },
    delivery: {
      pending: "En attente",
      success: "Réussi",
      failed: "Échec",
      deadLetter: "Dead letter",
      failedHint: "La dernière tentative a échoué, une autre est prévue.",
      deadLetterHint: "Toutes les tentatives ont échoué, cette livraison ne sera plus réessayée.",
    },
  },
  pricing: {
    title: "Tarifs",
    subtitle: "Choisissez le forfait adapté à votre équipe.",
    free: "Gratuit",
    perInterval: "{{amount}}/{{interval}}",
    interval: {
      day: "jour",
      week: "semaine",
      month: "mois",
      year: "an",
    },
    loading: "Chargement des forfaits…",
    loadFailed: "Impossible de charger les forfaits. Rechargez la page pour réessayer.",
    empty: "Aucun forfait n'est disponible pour le moment.",
    currentPlanCta: "Forfait actuel",
    getStarted: "Commencer",
    upgrade: "Mettre à niveau",
    upgradeNeedsOrgHint: "Sélectionnez une organisation pour mettre à niveau.",
    upgradeUnavailableHint: "Cette offre n'est pas encore disponible à l'achat.",
  },
} as const;
