import rss from '@astrojs/rss';
import { allPublishedEntries, entryUrl } from '../lib/entries';

export async function GET() {
  const entries = await allPublishedEntries();
  return rss({
    title: 'PrinceTronics',
    description: 'Maker build guides and software projects, with the code and the lessons learned.',
    site: import.meta.env.SITE,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary,
      pubDate: entry.data.publishDate,
      link: entryUrl(entry.collection, entry.id),
    })),
  });
}
