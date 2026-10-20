/** The instructor view lives at its own hash so it works without an open game. */
export const INSTRUCTOR_HASH = "#/instructor";

export const isInstructorHash = (): boolean => window.location.hash.startsWith(INSTRUCTOR_HASH);

export const openInstructorReview = (): void => {
  window.location.hash = INSTRUCTOR_HASH;
};
