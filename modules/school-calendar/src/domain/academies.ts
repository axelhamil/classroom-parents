import type { SchoolZoneValue } from "./value-objects/school-zone.vo";

export interface Academy {
  id: string;
  name: string;
  zone: SchoolZoneValue;
}

export const ACADEMIES: readonly Academy[] = [
  { id: "aix-marseille", name: "Aix-Marseille", zone: "zone-b" },
  { id: "amiens", name: "Amiens", zone: "zone-b" },
  { id: "besancon", name: "Besançon", zone: "zone-a" },
  { id: "bordeaux", name: "Bordeaux", zone: "zone-a" },
  { id: "clermont-ferrand", name: "Clermont-Ferrand", zone: "zone-a" },
  { id: "corse", name: "Corse", zone: "corse" },
  { id: "creteil", name: "Créteil", zone: "zone-c" },
  { id: "dijon", name: "Dijon", zone: "zone-a" },
  { id: "grenoble", name: "Grenoble", zone: "zone-a" },
  { id: "guadeloupe", name: "Guadeloupe", zone: "guadeloupe" },
  { id: "guyane", name: "Guyane", zone: "guyane" },
  { id: "la-reunion", name: "La Réunion", zone: "reunion" },
  { id: "lille", name: "Lille", zone: "zone-b" },
  { id: "limoges", name: "Limoges", zone: "zone-a" },
  { id: "lyon", name: "Lyon", zone: "zone-a" },
  { id: "martinique", name: "Martinique", zone: "martinique" },
  { id: "mayotte", name: "Mayotte", zone: "mayotte" },
  { id: "montpellier", name: "Montpellier", zone: "zone-c" },
  { id: "nancy-metz", name: "Nancy-Metz", zone: "zone-b" },
  { id: "nantes", name: "Nantes", zone: "zone-b" },
  { id: "nice", name: "Nice", zone: "zone-b" },
  { id: "normandie", name: "Normandie", zone: "zone-b" },
  { id: "orleans-tours", name: "Orléans-Tours", zone: "zone-b" },
  { id: "paris", name: "Paris", zone: "zone-c" },
  { id: "poitiers", name: "Poitiers", zone: "zone-a" },
  { id: "reims", name: "Reims", zone: "zone-b" },
  { id: "rennes", name: "Rennes", zone: "zone-b" },
  { id: "strasbourg", name: "Strasbourg", zone: "zone-b" },
  { id: "toulouse", name: "Toulouse", zone: "zone-c" },
  { id: "versailles", name: "Versailles", zone: "zone-c" },
];
