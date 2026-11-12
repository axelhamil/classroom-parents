export default {
  alert: {
    body: "{{childLabel}}, échéance {{deadline}}",
  },
  group: {
    titleChild_one: "{{count}} échéance pour {{childLabel}}",
    titleChild_other: "{{count}} échéances pour {{childLabel}}",
    titleChildren_one: "{{count}} échéance pour vos enfants",
    titleChildren_other: "{{count}} échéances pour vos enfants",
    line: "{{eventTitle}}, {{deadline}}",
    lineWithChild: "{{childLabel}} : {{eventTitle}}, {{deadline}}",
    more_one: "et {{count}} autre",
    more_other: "et {{count}} autres",
  },
} as const;
