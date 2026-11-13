export default {
  alert: {
    body: "{{childLabel}}, échéance {{deadline}}",
  },
  discreet: {
    body_one: "{{count}} échéance {{deadline}}",
    body_other: "{{count}} échéances à venir",
    week_one: "{{count}} échéance cette semaine.",
    week_other: "{{count}} échéances cette semaine.",
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
