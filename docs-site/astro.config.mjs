// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const REPO = 'https://github.com/SuperJackfruitLabs/treaty';
const SITE = 'https://treaty.superjackfruit.com';

export default defineConfig({
  site: SITE,
  integrations: [
    starlight({
      title: 'Treaty',
      description:
        "The suite's contracts as code: the CloudEvents envelope, the event and Matrix schemas, the shared fixtures and the event relay.",
      // /llms.txt, /llms-full.txt and /llms-small.txt, for agents reading these docs. The full
      // file carries every page, the generated event pages included.
      plugins: [
        starlightLlmsTxt({
          projectName: 'Treaty',
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
        }),
      ],
      components: { SiteTitle: './src/components/SiteTitle.astro' },
      // The lab's ink and paper, with jackfruit amber as the one accent; see the file for each value.
      customCss: ['./src/styles/theme.css'],
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
          },
        },
        // Absolute URLs: several unfurlers ignore a relative og:image.
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: "Treaty — the suite's contracts as code" } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${SITE}/og.png` } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What Treaty is', slug: 'what-it-is' },
            { label: 'Status', slug: 'status' },
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'The envelope and subjects', slug: 'envelope' },
            { label: 'Versioning and compatibility', slug: 'versioning' },
            { label: 'The relay', slug: 'relay' },
            { label: 'Fixtures and pinned versions', slug: 'fixtures' },
          ],
        },
        {
          label: 'Packages',
          items: [
            { label: 'Which package', slug: 'packages' },
            { label: 'treaty-cloudevents', slug: 'packages/cloudevents' },
            { label: 'treaty-event-schemas', slug: 'packages/event-schemas' },
            { label: 'treaty-matrix-events', slug: 'packages/matrix-events' },
            { label: 'treaty-ecosystem-identity', slug: 'packages/ecosystem-identity' },
            { label: 'treaty-outbox', slug: 'packages/outbox' },
          ],
        },
        // Generated from the schemas at build time (scripts/generate.mjs).
        { label: 'Event catalogue', items: [{ autogenerate: { directory: 'events' } }] },
        { label: 'Matrix events', collapsed: true, items: [{ autogenerate: { directory: 'matrix' } }] },
      ],
    }),
  ],
});
