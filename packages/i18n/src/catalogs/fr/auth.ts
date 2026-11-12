export default {
  login: {
    google: "Se connecter avec Google",
    pending: "Ouverture de Google…",
    failed: "La connexion avec Google n'a pas pu démarrer. Réessayez.",
    cancelled: "Connexion annulée sur Google. Recommencez quand vous voulez.",
    callbackFailed: "Google n'a pas pu finaliser la connexion. Réessayez.",
    ownAccount: "Utilisez votre propre compte Google. Ceux de vos enfants s'ajoutent ensuite.",
  },
  landing: {
    headline: "Toutes les échéances scolaires de vos enfants, avec une alerte avant chacune.",
    lead: "Contrôles, devoirs, sorties, piscine, papiers à signer : l'application les lit dans Google Classroom et les range par semaine, pour chaque enfant.",
    audience: "Pour les parents dont l'école utilise Google Classroom.",
    readOnly: "Lecture seule : l'application n'écrit jamais dans Classroom.",
    sample: {
      caption: "Exemple : ce que vous voyez le dimanche soir pour Léa et Malo.",
      lea: "Léa",
      malo: "Malo",
      fractions: "Contrôle sur les fractions",
      swimming: "Piscine : maillot, bonnet et serviette",
      museum: "Autorisation de sortie au muséum à signer",
    },
    benefits: {
      title: "Ce que ça change à la maison",
      family: {
        title: "Une seule liste pour toute la famille",
        body: "Chaque enfant a sa couleur, toutes ses classes sont réunies, la semaine se lit d'un coup d'œil.",
      },
      notes: {
        title: "Plus de papier oublié au fond du cartable",
        body: "Sorties, piscine et autorisations à signer ressortent des annonces des enseignants, avec leur date.",
      },
      timing: {
        title: "L'alerte arrive quand il est encore temps",
        body: "La veille au soir ou quelques jours avant, à l'heure que vous choisissez, sur votre téléphone.",
      },
    },
    steps: {
      title: "Comment ça marche",
      intro: "Trois étapes, environ deux minutes, une seule fois.",
      signIn: {
        title: "Je me connecte avec mon compte Google",
        body: "Le vôtre, celui de parent. Aucun mot de passe à créer.",
      },
      addChild: {
        title: "J'ajoute le compte Classroom de chaque enfant",
        body: "Avec son compte d'école, en lecture seule. L'application lit les annonces et les devoirs de ses classes.",
      },
      alerts: {
        title: "Je reçois les échéances et une alerte avant chacune",
        body: "Chaque date arrive rangée dans la semaine, et votre téléphone vous prévient au moment que vous choisissez.",
      },
    },
    flow: {
      label:
        "Classroom envoie les annonces et les devoirs à l'application, qui vous envoie les alertes. L'application n'écrit jamais dans Classroom.",
      classroom: "Classroom de l'enfant",
      app: "Échéances",
      phone: "Votre téléphone",
      reads: "lit",
      alerts: "alerte",
      never: "n'écrit jamais",
    },
    reads: {
      title: "Ce que l'application lit",
      courses: "La liste des classes Google Classroom de chaque enfant relié.",
      announcements:
        "Les annonces des enseignants, le temps d'en extraire les dates. Le texte n'est pas conservé.",
      coursework: "Les devoirs, leur date limite et s'ils sont rendus.",
    },
    never: {
      title: "Ce qu'elle ne fait jamais",
      write: "Elle n'écrit jamais dans Classroom : aucun devoir rendu, aucun commentaire.",
      grades: "Elle ne garde ni n'affiche aucune note.",
      messages: "Elle n'a accès ni à la messagerie ni aux commentaires privés de l'enfant.",
      ads: "Pas de publicité, pas de revente, pas d'entraînement de modèles d'IA.",
    },
    faq: {
      title: "Questions fréquentes",
      blocked: {
        question: "Et si l'école bloque l'application ?",
        answer:
          "Certains établissements limitent les applications sur les comptes élèves. L'application le détecte quand vous ajoutez l'enfant et vous donne le message exact à transmettre à l'école pour l'autoriser.",
      },
      data: {
        question: "Que deviennent les données de mes enfants ?",
        answer:
          "Seules les dates utiles sont gardées : titre, type et échéance. Elles servent uniquement à vous les afficher et à vous prévenir.",
        link: "Lire la politique de confidentialité",
      },
      deletion: {
        question: "Comment tout supprimer ?",
        answer:
          "Dans Réglages, « Supprimer mon compte ». Votre compte, les comptes reliés et toutes les échéances sont effacés au bout de 7 jours, et les accès Google sont révoqués. Vous pouvez aussi délier un seul enfant à tout moment.",
      },
      minors: {
        question: "Mon enfant est mineur, est-ce prévu pour ça ?",
        answer:
          "Oui. C'est vous, parent, qui reliez son compte d'école depuis votre propre compte. L'application ne lit que ses classes, n'écrit rien, et vous seul voyez ses échéances.",
      },
    },
    closing: {
      title: "Prêt pour la semaine qui vient ?",
      body: "Connectez votre compte, ajoutez le premier enfant, la liste se remplit toute seule.",
      action: "Continuer avec Google",
    },
  },
};
