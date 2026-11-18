import type { Person } from "../shared/model";
import { ordered } from "../shared/organization";

export const directoryLetters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
export function normalizePersonName(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export function personLetter(name: string) {
  const first = normalizePersonName(name)[0]?.toUpperCase() ?? "";
  return /^[A-Z]$/.test(first) ? first : "#";
}
export function directoryPeople(people: readonly Person[], query: string) {
  const words = normalizePersonName(query).split(/\s+/).filter(Boolean);
  return ordered(people, "name-asc").filter((person) => {
    const name = normalizePersonName(person.name);
    return words.every((word) => name.includes(word));
  });
}
