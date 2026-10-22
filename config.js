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
  endpoint: "",
  season: "Season 5",
  due: "2026-11-01",
  themesPerPerson: 2
};
