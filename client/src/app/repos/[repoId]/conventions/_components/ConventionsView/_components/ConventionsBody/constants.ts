/** Page sections, in display order (keys of `ConventionGroups` and `page.sections.*`). */
export const SECTIONS = ["pending", "accepted", "inSkills", "rejected"] as const;
export type SectionKey = (typeof SECTIONS)[number];
