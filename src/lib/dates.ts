/** "Jun 2014", in UTC so a date-only frontmatter value never shifts a month. */
export function monthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
