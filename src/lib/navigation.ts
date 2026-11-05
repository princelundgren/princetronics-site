import { getCollection } from 'astro:content';

/** Whether the navigation links Learning: only once the learning list has entries. */
export async function hasLearningEntries(): Promise<boolean> {
  return (await getCollection('learning')).length > 0;
}
