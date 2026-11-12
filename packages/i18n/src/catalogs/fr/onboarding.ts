export default {
  stepper: {
    position: "Étape {{current}} sur {{total}}",
    back: "Retour",
    progress: "Progression de l'ajout",
  },
  welcome: {
    title: "Ne ratez plus aucune échéance scolaire",
    description:
      "En 2 minutes, vous reliez le compte Classroom de votre enfant. Ses échéances arrivent ici, avec une alerte avant chacune.",
    planTitle: "Ce qui va se passer",
    plan: {
      account: "Vous choisissez le compte Google de l'élève.",
      read: "Nous lisons ses cours, ses annonces et ses devoirs.",
      alert: "Vous recevez une alerte avant chaque échéance.",
    },
    readOnly: "En lecture seule",
    readOnlyHint:
      "L'application consulte Classroom sans jamais rien y écrire : ni message, ni devoir rendu, ni modification.",
    never: "Jamais lu : les notes, les messages privés, les fichiers de l'élève.",
    start: "Commencer",
  },
  prepare: {
    title: "Avant de commencer",
    description: "Gardez ceci à portée de main, Google vous le demandera.",
    schoolAccount: "Le compte établissement de l'élève",
    schoolAccountDetail:
      "L'adresse Google donnée par l'école. Elle se termine souvent par le nom de l'établissement.",
    schoolAccountHint:
      "Un compte Google créé par l'école pour l'élève, différent d'un compte Gmail personnel.",
    password: "Son mot de passe",
    passwordDetail: "Ou votre enfant à côté de vous pour le saisir.",
    school: "Si l'école bloque l'application",
    schoolDetail:
      "Nous vous montrerons la procédure exacte à transmettre à l'école. Rien n'est perdu.",
    next: "J'ai tout, continuer",
  },
  connect: {
    title: "Connectez le compte de votre enfant",
    description:
      "Google va s'ouvrir. Dans la liste des comptes, choisissez celui de l'élève, pas le vôtre.",
    tips: {
      other: "Le compte n'apparaît pas ? Choisissez « Utiliser un autre compte ».",
      consent: "Google demande d'autoriser la lecture de Classroom : cochez toutes les cases.",
    },
    start: "Ajouter le compte Google de mon enfant",
    starting: "Ouverture de Google…",
    checking: "Vérification du compte Google…",
    registering: "Ajout de {{email}}…",
    pickTitle: "Quel compte ajouter ?",
    pickDescription: "Plusieurs comptes Google sont reliés. Choisissez celui de l'élève.",
    noneTitle: "Aucun nouveau compte à ajouter",
    noneDescription:
      "Ce compte Google est peut-être déjà relié. Recommencez en choisissant le compte de l'élève.",
    retry: "Recommencer avec un autre compte",
    discard: "Retirer ce lien et recommencer",
    blockedTitle: "L'école doit autoriser l'application",
    refusedTitle: "Google n'a pas relié le compte",
    tryAgain: "Réessayer",
    later: "Finir plus tard",
  },
  name: {
    title: "Comment s'appelle votre enfant ?",
    description: "Le prénom affiché sur ses échéances. Seul vous le voyez.",
    label: "Prénom affiché",
    hint: "Repris de son profil Google, vous pouvez le changer.",
    next: "Continuer",
    saving: "Enregistrement…",
    failed: "Le prénom n'a pas pu être enregistré. Réessayez.",
  },
  analysis: {
    title: "Lecture de Classroom",
    running:
      "Nous lisons les cours et les annonces de {{label}}. Cela prend en général moins de 3 minutes.",
    phases: {
      linked: "Compte relié",
      courses: "Lecture des cours et des annonces",
      deadlines: "Recherche des échéances",
    },
    found: "Voici ce qui arrive pour {{label}}.",
    noEvent:
      "Aucune échéance à venir pour l'instant. Vous serez prévenu dès qu'une annonce en contient une.",
    blocked: "L'école de {{label}} bloque la lecture de Classroom.",
    next: "Continuer",
    toEvents: "Voir les échéances",
    addAnother: "Ajouter un autre enfant",
  },
  reminders: {
    title: "Quand voulez-vous être prévenu ?",
    description:
      "Ces rappels valent pour chaque nouvelle échéance. Vous pourrez les changer pour une échéance précise.",
    preview: "Pour « {{title}} », vous serez prévenu : {{reminders}}.",
    previewNone: "Sans rappel, aucune alerte ne sera envoyée.",
    loading: "Chargement des rappels",
    skip: "Garder les rappels actuels",
    saveFailed: "Les rappels n'ont pas pu être enregistrés. Réessayez.",
  },
  notifications: {
    title: "Recevoir les alertes sur ce téléphone",
    description:
      "Une notification arrive avant chaque échéance, même quand l'application est fermée.",
    enable: "Activer les notifications",
    enabling: "Activation…",
    enabled: "Les notifications sont activées sur cet appareil.",
    skip: "Plus tard",
    next: "Continuer",
  },
  done: {
    title: "C'est prêt",
    description: "{{label}} est suivi. Ses échéances arrivent sur l'accueil.",
    account: "Compte relié : {{email}}",
    pushOn: "Alertes activées sur cet appareil.",
    pushOff: "Alertes par e-mail tant que les notifications sont désactivées.",
    home: "Aller à l'accueil",
    addAnother: "Ajouter un autre enfant",
  },
} as const;
