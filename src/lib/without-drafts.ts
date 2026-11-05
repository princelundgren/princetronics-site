import type { Loader } from 'astro/loaders';

/**
 * Wraps a loader so entries marked `draft: true` never reach the content store. Filtering
 * `getCollection` keeps a draft's pages out, but the store still bundles its images.
 */
export function withoutDrafts(loader: Loader): Loader {
  return {
    ...loader,
    load: async (context) => {
      await loader.load(context);
      for (const [id, entry] of context.store.entries()) {
        if (entry.data.draft === true) context.store.delete(id);
      }
    },
  };
}
