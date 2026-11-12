import { frCatalog, wallTimeLabel } from "@packages/i18n";
import type { SampleDeadline } from "./product-sample";

const sample = frCatalog.site.sample;
const { categories, countdown } = frCatalog.events;

function inDays(count: number): string {
  return countdown.inDays_other.replace("{{count}}", String(count));
}

export const SAMPLE_DEADLINES: SampleDeadline[] = [
  {
    id: "fractions",
    title: sample.fractions,
    daysAhead: 1,
    time: wallTimeLabel("08:30"),
    category: "assessment",
    categoryLabel: categories.assessment,
    childLabel: sample.lea,
    hue: 5,
    countdown: null,
  },
  {
    id: "swimming",
    title: sample.swimming,
    daysAhead: 3,
    time: wallTimeLabel("13:45"),
    category: "swimming",
    categoryLabel: categories.swimming,
    childLabel: sample.malo,
    hue: 2,
    countdown: inDays(3),
  },
  {
    id: "museum",
    title: sample.museum,
    daysAhead: 5,
    time: wallTimeLabel("08:30"),
    category: "documentDue",
    categoryLabel: categories.document_due,
    childLabel: sample.lea,
    hue: 5,
    countdown: inDays(5),
  },
];
