// Lead assignment (release C, spec 3.2): who a lead that arrives by itself goes to, and the settings that decide it.
export { chooseOwner, type AssignContext, type Assignment, type LeadFacts } from "./choose-owner.js";
export { poolPlaceOf, readAssignment, saveAssignment, setAway } from "./settings.js";
