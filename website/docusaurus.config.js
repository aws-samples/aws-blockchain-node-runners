// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'AWS Blockchain Node Runners',
  tagline: 'Run blockchain nodes on cloud',
  //favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://aws-samples.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/aws-blockchain-node-runners/',
  trailingSlash: false,
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'aws-samples', // Usually your GitHub org/user name.
  projectName: 'aws-blockchain-node-runners', // Usually your repo name.
  deploymentBranch: 'gh-pages',
  githubHost: 'github.com',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl:
            'https://github.com/aws-samples/aws-blockchain-node-runners/website',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      navbar: {
        title: '▣-▣-▣ Node Runners',
        items: [
          {
            type: 'doc',
            docId: 'intro/intro',
            position: 'left',
            label: 'Introduction',
          },
          {
            type: 'doc',
            docId: 'Blueprints/intro',
            position: 'left',
            label: 'Blueprints',
          },
          {
            href: 'https://github.com/aws-samples/aws-blockchain-node-runners',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Get Started',
            items: [
              {
                label: 'Docs',
                to: '/docs/intro',
              },
            ],
          },
          {
            title: 'Get Involved',
            items: [
              {
                label: 'Github',
                href: 'https://github.com/aws-samples/aws-blockchain-node-runners',
              },
              {
                label: 'Contribution guide',
                href: 'https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/CONTRIBUTING.md',
              }
            ],
          },
        ],
        copyright: `Built with ❤️ at AWS  <br/> © ${new Date().getFullYear()} Amazon.com, Inc. or its affiliates. All Rights Reserved.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;
