const issueFormUrl = 'https://github.com/princelundgren/princetronics-site/issues/new';

/** A link that opens the "Content fix" issue form with the page's URL and title filled in. */
export function suggestFixUrl(pageUrl: string, title: string): string {
  const query = new URLSearchParams({ template: 'content-fix.yml', title: `Content fix: ${title}`, page: pageUrl });
  return `${issueFormUrl}?${query}`;
}
