/* Family Movies site configuration.
 *
 * This is the ONE file to edit when something changes. The pages read it, so nothing else has to
 * be touched.
 *
 * endpoint: the Apps Script web app URL, ending in /exec. Paste it between the quotes.
 *           While it is empty the page still works for filling in and checking themes, but says
 *           plainly that saving is not switched on yet. It never pretends a submission was saved.
 * season:   the label stored with every submission, and shown in the page heading.
 * due:      the deadline shown on the page. ISO date, or empty to hide it.
 */
window.FM_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbz3AWj7YSsOYhp3DLGvLr-Vv1gaZDl6G1MFY0XJIb5P3IFjmqT9_xfznT_fgRYxFqcr/exec",
  season: "Season 5",
  due: "2026-11-01",
  themesPerPerson: 2,

  /* Birthday movie nights are worked out from these.
   *   seasonStart  first movie of the season, ISO date
   *   movieNight   0 = Sunday, 2 = Tuesday. 🛑 The DEFAULT only. Joe, 2026-10-22: the night
   *                sometimes moves to Wednesday for months, or for a single week. When the
   *                schedule feature exists it will override this; nothing may hardcode Tuesday.
   *   weeks        roughly how long the season runs, used only to decide which birthdays fall
   *                inside it. Approximate on purpose: skipped weeks push the real end later.
   *   birthdays    month and day. Joe 10/16, Juli 10/13, Miriam 2/3, Kathy 3/29.
   */
  seasonStart: "2026-12-01",
  movieNight: 2,
  weeks: 70,
  birthdays: { Joe: [10, 16], Juli: [10, 13], Miriam: [2, 3], Kathy: [3, 29] }
};
