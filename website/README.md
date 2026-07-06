# Website

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Deployment is automated. On every push to `main`, the
[`website-deploy.yaml`](../.github/workflows/website-deploy.yaml) GitHub Actions
workflow builds the site and publishes it to GitHub Pages using GitHub's
first-party Pages actions (build → `upload-pages-artifact` → `deploy-pages` to
the `github-pages` environment). There is no manual deploy step and no push to a
`gh-pages` branch.

The Docusaurus `yarn deploy` / `npm run deploy` command (which would build and
push to a `gh-pages` branch) is **not** used by this repository.
