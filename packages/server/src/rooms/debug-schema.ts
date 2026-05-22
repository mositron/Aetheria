import { WorldState } from "@game/shared";

const state = new WorldState();
console.log("=== STATIC PROPERTIES ===");
console.log(Object.getOwnPropertyNames(WorldState));
console.log(Object.getOwnPropertySymbols(WorldState));

console.log("=== INSTANCE PROPERTIES ===");
console.log(Object.getOwnPropertyNames(state));
console.log(Object.getOwnPropertySymbols(state));

console.log("=== PROTO PROPERTIES ===");
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(state)));

console.log("=== TYPEOF MAPID ===");
console.log("mapId on instance:", state.mapId);
console.log("descriptor for mapId:", Object.getOwnPropertyDescriptor(state, "mapId") || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(state), "mapId"));
