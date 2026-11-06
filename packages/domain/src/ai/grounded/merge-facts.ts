// Merges a checked read into the chat's facts: code alone writes facts, newer ones replace older ones, places accumulate.
import { roomCapacity, type RoomType } from "@travel-crm/contracts/quotes";
import type { ChatFacts, ReadAnswer } from "@travel-crm/contracts/ai";
import type { ReadKeys } from "./read-keys.js";

const MAX_PEOPLE_PER_TYPE = 1000;

/** Rooms to the people in them: one entry per type, the counts of a type summed, a child's place counting one each. */
function roomsOf(rooms: ReadAnswer["rooms"]): ChatFacts["rooms"] {
  const counts = new Map<RoomType, number>();
  for (const room of rooms) counts.set(room.type, (counts.get(room.type) ?? 0) + room.count);
  return [...counts].map(([roomType, count]) => ({
    roomType,
    people: Math.min(count * (roomCapacity[roomType] ?? 1), MAX_PEOPLE_PER_TYPE),
  }));
}

export function mergeFacts(facts: ChatFacts, read: ReadAnswer, keys: ReadKeys): ChatFacts {
  const merged: ChatFacts = { ...facts, places: [...facts.places], notRun: [...facts.notRun] };
  const named = new Set<string>(); // names of the destinations this read mentions
  let newPlace = false;

  for (const place of read.places) {
    if (place.destination === "none") {
      const words = place.words.trim();
      if (words !== "" && !merged.notRun.some((seen) => seen.toLowerCase() === words.toLowerCase())) {
        merged.notRun.push(words);
        newPlace = true;
      }
      continue;
    }
    const destination = keys.destinations.find((entry) => entry.key === place.destination);
    if (!destination) continue;
    named.add(destination.name.toLowerCase());
    if (!merged.places.some((seen) => seen.destinationId === destination.id)) {
      merged.places.push({ destinationId: destination.id, words: place.words });
      newPlace = true;
    }
  }

  if (read.startsOn) {
    const changed =
      read.startsOn.date !== null ? read.startsOn.date !== facts.startsOn : read.startsOn.month !== facts.month;
    merged.startsOn = read.startsOn.date;
    merged.month = read.startsOn.date === null ? read.startsOn.month : null;
    if (changed) merged.departureId = null;
  }
  if (read.rooms.length > 0) merged.rooms = roomsOf(read.rooms);
  if (read.travellers) merged.travellers = read.travellers.count;
  if (read.budgetRupees) merged.budgetPaise = read.budgetRupees.amount * 100;
  if (read.pickupCity) merged.pickupCity = read.pickupCity.words;

  const fitting = keys.packages.find((entry) => entry.id === facts.packageId);
  if (newPlace && !(fitting && named.has(fitting.destination.toLowerCase()))) {
    merged.packageId = null;
    merged.departureId = null;
  }
  const chosen = keys.packages.find((entry) => entry.key === read.chosen?.package);
  if (chosen) {
    if (chosen.id !== merged.packageId) merged.departureId = null;
    merged.packageId = chosen.id;
  }
  return merged;
}
