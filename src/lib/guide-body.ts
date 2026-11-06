/** Splits a guide's rendered body before its first `<h2>`: the intro above it, the steps from it on. */
export function splitAtFirstStep(html: string): { intro: string; steps: string } {
  const start = html.indexOf('<h2');
  return start === -1 ? { intro: html, steps: '' } : { intro: html.slice(0, start), steps: html.slice(start) };
}
