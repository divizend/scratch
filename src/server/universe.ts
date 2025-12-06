import { Universe } from "../";

let universe: Universe | null = null;

export function setUniverse(u: Universe | null) {
  universe = u;
}

export function getUniverse(): Universe | null {
  return universe;
}

