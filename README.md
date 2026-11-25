# Steven Di Jorio portfolio

The portfolio uses static HTML and CSS on GitHub Pages. The public output stays at the branch root so the existing GitHub Pages setup and custom domain continue to work. Python generates the pages, sitemap, and robots file from tracked content. The website has no runtime package dependencies.

## Build and preview

Use Python 3.10 or later from the repository root.

```sh
python3 _portfolio/build.py
python3 _portfolio/build.py --check
preview="$(mktemp -d)"
python3 _portfolio/build.py --output "$preview"
python3 _portfolio/qa/verify_public.py "$preview"
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$preview"
```

Open [the local preview](http://127.0.0.1:4173/). Use a fresh preview directory after editing. The preview contains the public files and excludes the repository and authoring directories. Keep private sources outside the repository and use `assets/` only for cleared public files. Reserved legacy URLs and the existing custom domain are part of the smoke test.

## Maintain content

- **Add a publication.** Add an entry to `publications` in `_portfolio/content.json`. Use a stable lowercase ID, the record’s precise type and title, ordered authors, exact portfolio author name, venue, date, and official links. For a published proceeding include the DOI and pagination when available. If replacing the homepage feature, set `featured.publication` to the new ID and ensure an official link appears first. Verify publisher metadata and any permission or status required for public listing.
- **Add a research or engineering project.** Add a record to `research` or `engineering` in the same file. Include an accessible summary, research or engineering context, individual contribution, methods, outcome and status, limitations, and supporting links. For a text-based methods figure, add a `workflow` object with a title, caption, and ordered label/detail pairs. For a homepage feature, list the ID in the corresponding `featured` array. The first research feature uses the CURE poster photograph, so update the featured image in `_portfolio/build.py` if that lead project changes.
- **Update the public CV.** Revise the selected entries and PDF path and dates in `documents.cv`. Its research entries, publication and experience selections, and methods drive both the browser CV and the generated PDF. Run `python3 -m pip install reportlab` in an isolated environment and `python3 _portfolio/make_public_cv.py` to regenerate the portfolio edition. For an approved replacement PDF, place it at the configured path, visually inspect all pages, and verify the download. Use a public edition with approved contact details. The checked-in version is the one served.
- **Update education, roles, fellowships, competencies, and profiles.** Make changes in `_portfolio/content.json`. Link competencies to projects or experience. The structured profile and site-wide links follow the same public record. Set `person.contact_profile` to the label of the public professional profile used for contact.
- **Update the interactive review.** Edit the educational text and citation records in `_portfolio/resources.json`. Keep existing routes and section IDs stable. Verify that added scientific claims point to a specific source.

Rerun the build and package checks after each edit. Commit both source and generated HTML. HTML files produced by the generator should be edited at their source. Primary site CSS lives at `assets/site.css`.

## Browser checks

Install the optional reproducible QA tools from `_portfolio/qa` using `npm ci`. Use an installed Google Chrome and run the scripts against the local preview. For an original-versus-revised comparison, serve commit `b2e2a03` from a different port and use the same browser and host conditions.

```sh
npm ci --prefix _portfolio/qa
audit_output="$(mktemp -d)"
node _portfolio/qa/benchmark.mjs after http://127.0.0.1:4173 "$audit_output"
node _portfolio/qa/journeys.mjs after http://127.0.0.1:4173 "$audit_output/audits/after-journeys.json"
node _portfolio/qa/phone.mjs http://127.0.0.1:4173 "$audit_output/phones"
bash _portfolio/qa/lighthouse.sh after http://127.0.0.1:4173 "$audit_output/audits" mobile
bash _portfolio/qa/lighthouse.sh after http://127.0.0.1:4173 "$audit_output/audits" desktop
```

## Release and rollback

1. Obtain approval of the website release, the portfolio CV, and the proposed breadboard photograph.
2. Confirm the current live GitHub Pages deployment SHA in GitHub Deployments. Run the build, package check, and browser checks against the candidate. Recheck the DOI and the three profile links.
3. Apply the candidate on a branch based on the current `main`, and review the complete diff before merging. Prefer a single squash merge so a single revert removes the release changes. The project’s last inspected Pages deployment was from `main`; Pages should deploy after the approved merge. Keep the `CNAME` and environment settings.
4. Check the deployment status and smoke-test the custom-domain homepage, publications, PDF, sitemap, and both legacy review URLs. Compare the live deployment SHA to the approved release.
5. To roll back, create a new revert of the release commit through the usual branch/review process and merge it to `main`. Preserve unrelated changes. Verify the resulting Pages deployment and custom-domain routes. The original commit `b2e2a03eaa8eab3f8683ddfebe122068856e81d9` is the reference checkpoint.
