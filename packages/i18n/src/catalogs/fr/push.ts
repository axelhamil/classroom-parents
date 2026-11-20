export default {
  accessLoss: {
    title: "Accès Google perdu",
    body: "Reconnectez le compte de {{childLabel}} pour continuer à recevoir ses échéances.",
    discreetBody: "Un compte enfant est à reconnecter pour continuer à recevoir ses échéances.",
  },
  alert: {
    body: "{{childLabel}}, échéance {{deadline}}",
  },
  discreet: {
    body_one: "{{count}} échéance {{deadline}}",
    body_other: "{{count}} échéances à venir",
  },
  digest: {
    title: "Votre semaine",
    discreet_one: "{{count}} échéance cette semaine.",
    discreet_other: "{{count}} échéances cette semaine.",
    oneChild_one: "{{count}} échéance cette semaine pour {{childLabel}}.",
    oneChild_other: "{{count}} échéances cette semaine pour {{childLabel}}.",
    children_one: "{{count}} échéance cette semaine : {{perChild}}.",
    children_other: "{{count}} échéances cette semaine : {{perChild}}.",
    childCount: "{{count}} pour {{childLabel}}",
    next: "Prochaine : {{line}}.",
    summary: "{{counts}} {{next}}",
  },
  group: {
    titleChild_one: "{{count}} échéance pour {{childLabel}}",
    titleChild_other: "{{count}} échéances pour {{childLabel}}",
    titleChildren_one: "{{count}} échéance pour vos enfants",
    titleChildren_other: "{{count}} échéances pour vos enfants",
    more_one: "et {{count}} autre",
    more_other: "et {{count}} autres",
  },
} as const;
