// Public API of the catalog module: the agency's destinations (spec 6, L0). Quotes will use the same rows.
export {
  destinationById,
  destinationNames,
  findOrAddDestination,
  mergeDestination,
  renameDestination,
  searchDestinations,
} from "./destinations.js";
