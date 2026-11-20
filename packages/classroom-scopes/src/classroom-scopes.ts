/**
 * The Google Classroom OAuth scopes the product asks for a child's account, all read only.
 *
 * One list for every surface that names them: the api requests and checks exactly these, and the
 * public page for school administrators prints them so the admin can allow precisely these
 * scopes ("specific Google data"). A scope added here reaches both, so the admin is never asked
 * to allow less than the app requests.
 */
export const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
] as const;
