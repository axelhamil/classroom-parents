export default {
  home: {
    title: "Réglages",
    description: "Vos alertes, vos appareils et les données de votre famille.",
  },
  appearance: {
    title: "Apparence",
    description:
      "Le thème de l'application sur cet appareil. Automatique suit le réglage clair ou sombre de l'appareil.",
  },
  tour: {
    title: "Visite guidée",
    description: "Les repères de chaque écran, montrés une fois. Relancez-les à tout moment.",
    action: "Revoir la visite guidée",
  },
  devices: {
    title: "Appareils connectés",
    description: "Les téléphones et ordinateurs où votre compte est ouvert.",
    loading: "Chargement de vos appareils",
    loadError: "Impossible de charger vos appareils.",
    label: "{{browser}} sur {{device}}",
    unknown: "Appareil inconnu",
    kind: {
      ios: "iPhone ou iPad",
      android: "Android",
      mac: "Mac",
      windows: "Windows",
      linux: "Linux",
      unknown: "un appareil inconnu",
    },
    browser: {
      chrome: "Chrome",
      safari: "Safari",
      firefox: "Firefox",
      edge: "Edge",
      samsung: "Samsung Internet",
      unknown: "Navigateur",
    },
    current: "Cet appareil",
    currentActivity: "Celui que vous utilisez en ce moment.",
    lastActive: "Dernière activité le {{date}}.",
    others: "Vos autres appareils",
    alone: "Aucun autre appareil n'est connecté à votre compte.",
    revoke: "Déconnecter",
    revoked: "Appareil déconnecté. Il ne reçoit plus vos alertes.",
    revokeFailed: "L'appareil n'a pas pu être déconnecté. Réessayez dans un instant.",
    revokeOthers: "Se déconnecter partout ailleurs",
    revokeOthersTitle: "Déconnecter les autres appareils ?",
    revokeOthersDescription:
      "Vos autres appareils ne recevront plus vos alertes et devront se reconnecter avec Google pour revoir les échéances de vos enfants. Cet appareil reste connecté.",
    revokeOthersConfirm: "Oui, les déconnecter",
    revokedOthers: "Vos autres appareils sont déconnectés et ne reçoivent plus vos alertes.",
    revokeOthersFailed:
      "Vos autres appareils n'ont pas pu être déconnectés. Réessayez dans un instant.",
  },
  push: {
    title: "Notifications sur ce téléphone",
    description: "Une notification à chaque rappel de vos échéances, même application fermée.",
    defaults: "Rappels par défaut : {{reminders}}.",
    noDefaults:
      "Aucun rappel par défaut : seules les échéances dont vous avez choisi les rappels envoient une alerte.",
    enabled: "Activées",
    enabledBody: "Ce téléphone reçoit les alertes de vos échéances.",
    enable: "Activer les alertes",
    enabling: "Activation…",
    disable: "Ne plus recevoir d'alertes ici",
    disabling: "Désactivation…",
    enabledToast: "Alertes activées sur ce téléphone.",
    disabledToast: "Alertes désactivées sur ce téléphone.",
    enableFailed: "Les alertes n'ont pas pu être activées. Réessayez dans un instant.",
    disableFailed: "Les alertes n'ont pas pu être désactivées. Réessayez dans un instant.",
    unsupported:
      "Ce navigateur ne sait pas recevoir de notifications. Ouvrez l'application dans Chrome, Edge, Firefox ou Safari récent.",
    deniedTitle: "Notifications bloquées",
    denied:
      "Vous avez refusé les notifications pour cette application. Pour les autoriser : sur Android, touchez le cadenas à gauche de l'adresse, puis Autorisations, puis Notifications. Sur iPhone, ouvrez Réglages, puis Notifications, puis cette application. Revenez ensuite sur cette page.",
    emailFallback:
      "Aucun appareil ne reçoit vos alertes pour l'instant : elles vous sont envoyées par e-mail, à l'adresse de votre compte Google.",
    installFirst: "Ajoutez d'abord l'application à l'écran d'accueil.",
  },
  reminders: {
    title: "Rappels par défaut",
    description:
      "De 0 à 5 rappels pour chaque échéance. Une échéance dont vous avez choisi les rappels garde les siens.",
    loading: "Chargement des rappels par défaut",
    loadError: "Impossible de charger les rappels par défaut.",
    saved: "Rappels par défaut enregistrés",
  },
  install: {
    title: "Installer sur l'iPhone",
    description:
      "Sur iPhone, les alertes ne fonctionnent que depuis l'application installée sur l'écran d'accueil.",
    steps: {
      share: "Dans Safari, touchez le bouton « Partager ».",
      addToHome: "Choisissez « Sur l'écran d'accueil », puis « Ajouter ».",
      reopen:
        "Ouvrez l'application depuis son icône, revenez dans Réglages et activez les alertes.",
    },
  },
  links: {
    title: "Confidentialité",
    description: "Ce que l'application lit, ce qu'elle garde, et vos droits.",
    privacy: "Confidentialité et données",
    policy: "Politique de confidentialité",
    dataRights: "Vos droits sur vos données",
  },
  account: {
    title: "Compte",
    description: "Votre compte Google sert à vous connecter, rien de plus.",
  },
  signOut: {
    title: "Se déconnecter",
    description: "Cet appareil ne recevra plus vos alertes.",
    action: "Se déconnecter",
    dialogTitle: "Se déconnecter de ce téléphone ?",
    dialogDescription:
      "Ce téléphone ne recevra plus vos alertes. Vous devrez vous reconnecter avec Google pour revoir les échéances de vos enfants et réactiver les alertes.",
    confirm: "Se déconnecter",
    pending: "Déconnexion…",
  },
  deletion: {
    title: "Supprimer mon compte",
    description:
      "Votre compte, les comptes Google de vos enfants liés à l'application et toutes leurs échéances sont effacés au bout de 7 jours. Les accès Google sont révoqués.",
    action: "Supprimer mon compte",
    dialogTitle: "Supprimer votre compte ?",
    dialogDescription:
      "Rien n'est effacé avant 7 jours : vous pouvez annuler jusque-là depuis cette page. Passé ce délai, l'effacement est définitif.",
    confirm: "Oui, supprimer mon compte",
    submitting: "Envoi…",
    requestedToast: "Suppression programmée. Vous pouvez l'annuler pendant 7 jours.",
    requestFailed: "La suppression n'a pas pu être demandée. Réessayez dans un instant.",
    reauthTitle: "Confirmez votre identité",
    reauth:
      "Par sécurité, reconnectez-vous avec Google, puis relancez la suppression depuis cette page.",
    reauthAction: "Me reconnecter avec Google",
    reauthPending: "Redirection vers Google…",
    reauthFailed: "La connexion Google n'a pas pu démarrer. Réessayez dans un instant.",
    reauthCancelled: "Confirmation Google annulée : votre compte n'est pas supprimé.",
    reauthCallbackFailed:
      "Google n'a pas pu confirmer votre identité. Votre compte n'est pas supprimé, réessayez.",
    scheduledTitle: "Suppression programmée",
    scheduledDescription:
      "Votre compte sera effacé le {{date}}. Vous pouvez annuler la suppression jusque-là.",
    cancelling: "Annulation…",
    cancel: "Annuler la suppression",
    cancelledToast: "Suppression annulée. Votre compte est conservé.",
    cancelFailed: "La suppression n'a pas pu être annulée. Réessayez dans un instant.",
  },
  privacy: {
    pageTitle: "Confidentialité et données",
    pageDescription: "Ce que l'application lit, ce qu'elle garde et ce qu'elle ne fait jamais.",
    reads: {
      title: "Ce que nous lisons",
      description:
        "En lecture seule, depuis le compte Google de chaque enfant que vous liez à l'application.",
      courses: "La liste de ses cours Google Classroom.",
      announcements:
        "Les annonces de ses enseignants, le temps d'en extraire les dates (le texte n'est pas conservé).",
      coursework: "Ses devoirs et leur date limite, et s'ils sont rendus.",
    },
    limitedUse: {
      title: "Usage limité des données Google",
      body: "L'utilisation des données reçues des API Google respecte la politique Google API Services User Data Policy, y compris ses exigences d'usage limité (Limited Use). Ces données servent uniquement à afficher les échéances de vos enfants et à vous prévenir : jamais de publicité, de revente, ni d'entraînement de modèles d'IA.",
    },
    ai: {
      title: "Extraction par Anthropic",
      body: "Le texte d'une annonce est envoyé à Anthropic (modèles Claude), sous-traitant, pour en extraire les dates. Anthropic n'utilise pas ces données pour entraîner ses modèles. Les devoirs Classroom, eux, sont lus sans IA.",
    },
    dataSources: {
      title: "Sous-traitants",
      description: "Les prestataires qui font fonctionner le service.",
      viewAll: "Voir le registre des sous-traitants",
    },
    retention: {
      title: "Combien de temps nous gardons vos échéances",
      body: "Une échéance reste 12 mois après sa date, puis elle est effacée avec ses rappels. Une échéance que vous supprimez ou que l'enseignant retire est effacée 30 jours plus tard ; un devoir Classroom reste au moins 61 jours après sa date, pour qu'une synchronisation ne le recrée pas.",
    },
    rights: {
      title: "Vos droits",
      description:
        "Retirez un enfant depuis l'écran Enfants pour révoquer son accès et effacer ses données. Supprimez votre compte depuis Réglages.",
      contact: "Pour toute question : <mail>{{email}}</mail>",
    },
  },
} as const;
