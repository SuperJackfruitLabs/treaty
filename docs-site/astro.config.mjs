// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sjlDocs from '@superjackfruit/docs-theme';

const REPO = 'https://github.com/SuperJackfruitLabs/treaty';
const SITE = 'https://treaty.superjackfruit.com';

export default defineConfig({
  site: SITE,
  integrations: [
    starlight({
      title: 'Treaty',
      description:
        "The suite's contracts as code: the CloudEvents envelope, the event and Matrix schemas, the shared fixtures and the event relay.",
      // The suite's docs theme. Treaty is the suite's shared contracts, not a product, so it wears
      // the lab's look (vibekit's graphite, the lab's mark) and is no house on the product street;
      // see @superjackfruit/docs-theme's README. It brings the street, the footers, the 404, the
      // edit link, Copy and Open as Markdown, and /llms.txt, /llms-full.txt and /llms-small.txt for
      // agents reading these docs. The full file carries every page, the generated event pages
      // included.
      plugins: [
        sjlDocs({
          site: {
            slug: 'treaty',
            name: 'Treaty',
            url: SITE,
            repo: REPO,
            line: "The suite's contracts as code.",
            wears: 'lab',
          },
          status: 'lights on',
          llms: {
            description:
              "Treaty holds the contracts between Super Jackfruit Labs products as code: a CloudEvents 1.0 " +
              'codec (binary mode over HTTP and NATS) and the suite\'s subject and type names; JSON Schemas ' +
              "for the events SuperPipeline sends and for every board-room Matrix event; the shared identity " +
              'fixture corpus; a transactional outbox and deduplicating inbox; and the relay that carries ' +
              'events from Cloudflare Workers to NATS JetStream and back over signed HTTP. It defines; the ' +
              "products carry. It holds no product's data. Packages are on npm as " +
              '@superjackfruitlabs/treaty-*, MIT, current version v0.0.13.',
            optionalLinks: [
              { label: 'Source', url: REPO, description: 'The treaty repository on GitHub.' },
              {
                label: 'npm',
                url: 'https://www.npmjs.com/search?q=%40superjackfruitlabs%2Ftreaty',
                description: 'The published @superjackfruitlabs/treaty-* packages.',
              },
            ],
          },
        }),
      ],
      favicon: '/favicon.svg',
      head: [
        // Absolute URLs: several unfurlers ignore a relative og:image.
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: "Treaty — the suite's contracts as code" } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${SITE}/og.png` } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      // The suite's five groups, in the order a reader needs them. Every page keeps its address.
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What Treaty is', slug: 'what-it-is' },
            { label: 'Status', slug: 'status' },
          ],
        },
        {
          label: 'Use it',
          items: [
            { label: 'The envelope and subjects', slug: 'envelope' },
            { label: 'Versioning and compatibility', slug: 'versioning' },
            { label: 'Fixtures and pinned versions', slug: 'fixtures' },
          ],
        },
        {
          label: 'Build on it',
          items: [
            { label: 'Which package', slug: 'packages' },
            { label: 'treaty-cloudevents', slug: 'packages/cloudevents' },
            { label: 'treaty-event-schemas', slug: 'packages/event-schemas' },
            { label: 'treaty-matrix-events', slug: 'packages/matrix-events' },
            { label: 'treaty-ecosystem-identity', slug: 'packages/ecosystem-identity' },
            { label: 'treaty-outbox', slug: 'packages/outbox' },
          ],
        },
        {
          label: 'Run it',
          items: [{ label: 'The relay', slug: 'relay' }],
        },
        {
          label: 'Reference',
          items: [
            // Generated from the schemas at build time (scripts/generate.mjs).
            { label: 'Event catalogue', items: [{ autogenerate: { directory: 'events' } }] },
            { label: 'Matrix events', collapsed: true, items: [{ autogenerate: { directory: 'matrix' } }] },
          ],
        },
      ],
    }),
  ],
});
