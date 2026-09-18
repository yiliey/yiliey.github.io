# yiliey.github.io

Personal academic site — publications, projects, and background.

**Live:** https://yiliey.github.io

## Editing content

Most changes are content, not code. Nothing here needs a rebuild by hand — push
to `main` and the site redeploys itself.

| What | Where |
|---|---|
| Name, links, navigation, avatar | `content/config.toml` |
| About text | `content/bio.md` |
| Publications | `content/publications.bib` |
| Experience / education / awards | `content/*.toml` |
| Figures shown on the Projects page | `public/projects/` |

The three cards on the Projects page are defined in
`src/app/projects/FlowShowcase.tsx`, because each one is wired to the input and
output modalities that the animated rails on either side draw from.

`config.toml` has one field worth explaining: `publication_name`. The site's
display name and the name on the papers can differ, and this is the one used to
pick the right author out of a BibTeX author list for bolding.

## Running it locally

Node 22 (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # static export into out/
```

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
through GitHub Pages. The repository holds source only — the built site is never
committed.

This requires **Settings → Pages → Source** to be set to **GitHub Actions**.

## Credits

Built on [PRISM](https://github.com/gitkeniwo/PRISM), an academic site template,
used under the MIT License — see `LICENSE`. The layout, the particle field, the
Projects page and the interaction work here have since diverged substantially
from the template.
