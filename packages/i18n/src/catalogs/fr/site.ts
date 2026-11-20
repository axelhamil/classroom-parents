export default {
  meta: {
    title: "KeepUpKids : les échéances scolaires de vos enfants",
    description:
      "Contrôles, devoirs, sorties et papiers à signer de vos enfants, lus dans Google Classroom en lecture seule, rangés par semaine, avec une alerte avant chaque échéance.",
    ogTitle: "KeepUpKids : toutes les échéances scolaires de vos enfants",
    ogDescription:
      "L'application lit Google Classroom pour vous, en lecture seule, et vous prévient avant chaque contrôle, devoir ou sortie.",
    applicationDescription:
      "Application pour parents : lit en lecture seule les annonces et devoirs Google Classroom de chaque enfant, range les échéances par semaine et envoie une alerte avant chacune.",
    audience: "Parents d'élèves",
  },
  cta: "Continuer avec Google",
  headline: "Les échéances scolaires de vos enfants, sans en oublier une.",
  lead: "Contrôles, devoirs, sorties et papiers à signer, lus dans Google Classroom, avec une alerte avant chacun.",
  readOnly: "Lecture seule : l'application n'écrit jamais dans Classroom.",
  sample: {
    week: "Cette semaine",
    caption: "Exemple pour deux enfants, Léa et Malo.",
    lea: "Léa",
    malo: "Malo",
    fractions: "Contrôle sur les fractions",
    swimming: "Piscine : maillot, bonnet et serviette",
    museum: "Autorisation de sortie au muséum à signer",
    notification: {
      time: "maintenant",
      title: "Demain 8 h 30 : contrôle sur les fractions",
      body: "Léa a encore ce soir pour réviser.",
    },
  },
  proofs: {
    title: "En bref",
    family: "Tous vos enfants et toutes leurs classes dans une seule semaine.",
    alerts: "Une alerte sur votre téléphone avant chaque échéance, à l'heure que vous choisissez.",
    readOnly: "Rien n'est écrit dans Classroom, aucune note gardée, aucune publicité.",
  },
  faq: {
    title: "Questions fréquentes",
    blocked: {
      question: "Et si l'école bloque l'application ?",
      answer:
        "L'application le détecte quand vous ajoutez l'enfant et vous donne le message exact à transmettre à l'école pour l'autoriser.",
      link: "Le guide pour l'administrateur de l'école",
    },
    data: {
      question: "Que deviennent les données de mes enfants ?",
      answer:
        "Seuls le titre, le type et la date de chaque échéance sont gardés, pour vous les afficher et vous prévenir.",
      link: "Lire la politique de confidentialité",
    },
    deletion: {
      question: "Comment tout supprimer ?",
      answer:
        "Dans Réglages, « Supprimer mon compte » efface votre compte, les comptes reliés et toutes les échéances au bout de 7 jours, et révoque les accès Google.",
    },
  },
  closing: {
    title: "Prêt pour la semaine qui vient ?",
  },
  schools: {
    meta: {
      title: "Autoriser KeepUpKids dans votre établissement Google Workspace for Education",
      description:
        "Guide pour les administrateurs Google Workspace for Education : autoriser KeepUpKids, en lecture seule sur Google Classroom, pour les comptes élèves de moins de 18 ans, en deux minutes.",
      breadcrumb: "Autoriser KeepUpKids",
      audience: "Administrateurs Google Workspace for Education",
    },
    eyebrow: "Pour les administrateurs Google Workspace for Education",
    title: "Autoriser KeepUpKids dans votre établissement",
    lead: "Des parents de votre établissement utilisent KeepUpKids pour suivre les échéances publiées dans Google Classroom. Google bloque par défaut, pour les comptes désignés comme ayant moins de 18 ans, toute application tierce qui n'a pas encore été configurée. Voici comment l'autoriser, en lecture seule.",
    steps: {
      title: "Les étapes dans la console d'administration",
      console:
        "Connectez-vous à admin.google.com avec un compte administrateur qui dispose du droit « Paramètres du service ».",
      path: "Ouvrez Menu > Sécurité > Contrôle des accès et des données > Commandes des API.",
      manage:
        "Cliquez sur « Gérer l'accès des applications », puis, dans « Applications configurées », sur « Configurer une nouvelle application ».",
      search:
        "Collez l'ID client ci-dessous, cliquez sur « Rechercher », puis choisissez KeepUpKids dans les résultats.",
      scope:
        "Sous « Champ d'application », gardez l'unité organisationnelle racine ou cochez celle des élèves, puis cliquez sur « Continuer ».",
      access:
        "Dans « Accès aux données Google », choisissez « Données Google spécifiques » et gardez les trois autorisations listées plus bas (« Approuvée » fonctionne aussi), puis cliquez sur « Continuer » et « Terminer ».",
    },
    clientId: {
      label: "ID client OAuth",
      copy: "Copier l'ID client",
      copied: "ID client copié.",
    },
    scopes: {
      title: "Autorisations demandées, toutes en lecture seule",
      courses: "Voir la liste des cours de l'élève.",
      announcements: "Lire les annonces publiées dans ces cours.",
      submissions: "Voir les devoirs donnés à l'élève et leurs dates de rendu.",
    },
    delay: {
      title: "Après l'enregistrement",
      body: "Google indique que la modification peut prendre jusqu'à 24 heures, même si elle est en général plus rapide. Les parents reconnectent ensuite le compte de leur enfant dans l'application, et la lecture reprend.",
      classroom:
        "Si l'accès reste refusé, vérifiez aussi Applications > Google Workspace > Classroom > Accès aux données : l'option de l'API Classroom doit permettre aux utilisateurs d'autoriser l'accès à leurs données Classroom.",
    },
    reads: {
      title: "Ce que l'application lit",
      body: "Les cours, les annonces et les devoirs de l'élève, pour en extraire les échéances : contrôles, devoirs à rendre, sorties, papiers à signer. Elle n'en garde que le titre, le type et la date.",
    },
    never: {
      title: "Ce qu'elle ne fait jamais",
      write: "Elle n'écrit, ne publie et ne modifie rien dans Classroom.",
      keep: "Elle ne garde ni note, ni travail rendu, ni message.",
      ads: "Aucune publicité, aucune revente de données.",
      erase:
        "Elle ne garde rien après la déconnexion d'un enfant : l'accès Google est révoqué et ses données supprimées.",
    },
    data: {
      title: "Où vont les données",
      body: "Les données sont traitées par les seuls sous-traitants listés, avec leur rôle et leur région, dans notre registre public.",
      subProcessors: "Registre des sous-traitants",
      privacy: "Politique de confidentialité",
    },
    contact: {
      title: "Une question ?",
      body: "Écrivez-nous à cette adresse :",
    },
  },
};
