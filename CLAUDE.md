# The Paper Book

A child's drawn and stapled story book as a paper world you walk through by scrolling: the drawings
stand as cut-outs under one light. This public repository holds the code, the tools and a
three-page sample book. A real book lives in its own private repository.

## Rules that are not visible in the code

- One vendored file, never a build. The only dependency is `site/vendor/three.module.js`.
  No package manager, no bundler, no framework, no font or script from outside `site/`.
- `site/` must open from a folder with nothing more than a static file server.
- No real child's drawings, words, photos or names in this repository. The sample book is drawn by
  `tools/sample.sh`. Original photos carry GPS: they belong in `archive/`, which git ignores.
- A child's spelling stays as written, in pictures and in alt text. The printed caption for each
  page is in corrected English. It sits beside the writing and never replaces it.
- The page carries `<meta name="robots" content="noindex, noimageindex">`, and `site/vercel.json` sends
  `X-Robots-Tag: noindex` on every response, images included. A page-level `noindex` alone leaves the
  images open to image search. `./tools/check.sh --release` refuses to publish without either.
- No cookies, and no analytics in the site's own code.

## Commands

```
python3 -m http.server 8765 --directory site   # serve
./tools/sample.sh                              # redraw the sample page and its cut-outs
./tools/check.sh                               # the runnable check for the tools
node --test tools/                             # tests for the pure functions
```

## Process

- Conventional commit prefixes. No attribution lines.
- Code and assets go through a pull request with a Codex review, per Mark's global rules.
- GitHub Pages serves `site/` from `main` through `.github/workflows/pages.yml`. The job is skipped
  while the repository is private, because Pages on a private repository needs a paid plan.
