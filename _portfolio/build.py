#!/usr/bin/env python3
"""Render the public portfolio to the existing GitHub Pages branch root."""

import argparse
import json
import re
import shutil
from collections import defaultdict
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
ORIGIN = "https://stevendijorio.com"
CONTENT = json.loads((SOURCE / "content.json").read_text())
RESOURCES = json.loads((SOURCE / "resources.json").read_text())
PERSON = CONTENT["person"]
CV = CONTENT["documents"]["cv"]
NAV = {
    "/research/": "Research",
    "/publications/": "Publications",
    "/engineering/": "Engineering",
    "/experience/": "Experience",
}
HOME_DESCRIPTION = "Steven Di Jorio studies biomedical engineering at the University of Oklahoma. Explore his work in medical imaging, neuromorphic hardware, and clinical research."


def e(value):
    return escape(value, quote=True)


def link(label, url, style="text-link", attributes=""):
    return f'<a class="{style}" href="{e(url)}"{attributes}>{e(label)}</a>'


def links(items, style="link-list"):
    if not items:
        return ""
    return f'<ul class="{style}">' + "".join(
        f'<li>{link(item["label"], item["url"])}</li>' for item in items
    ) + "</ul>"


def action(label, url, secondary=False, download=False):
    style = "button button-secondary" if secondary else "button"
    return link(label, url, style, " download" if download else "")


def heading(label, title, intro=""):
    description = f'<p class="page-description">{e(intro)}</p>' if intro else ""
    eyebrow = f'<p class="eyebrow">{e(label)}</p>' if label else ""
    return f'''<header class="page-heading wrap">
      {eyebrow}
      <h1>{e(title)}</h1>{description}
    </header>'''


def navigation(route):
    return "".join(
        f'<li>{link(label, path, "", " aria-current=\"page\"" if route == path else "")}</li>'
        for path, label in NAV.items()
    )


def header(route):
    current = ' aria-current="page"' if route == "/cv/" else ""
    items = navigation(route)
    cv = f'<li>{link("CV", "/cv/", "nav-cv", current)}</li>'
    contact = f'<li>{link("Contact", "/#contact", "")}</li>'
    return f'''<a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap header-inner">
        <a class="wordmark" href="/">{e(PERSON["name"])}</a>
        <nav class="desktop-nav" aria-label="Main"><ul>{items}{contact}{cv}</ul></nav>
        <details class="mobile-menu">
          <summary>Menu <span class="menu-icon" aria-hidden="true"></span></summary>
          <nav aria-label="Main"><ul>{items}{contact}{cv}</ul></nav>
        </details>
      </div>
    </header>'''


def footer():
    contact = next(profile for profile in PERSON["profiles"] if profile["label"] == PERSON["contact_profile"])
    other_profiles = [profile for profile in PERSON["profiles"] if profile != contact]
    return f'''<footer class="site-footer" id="contact">
      <div class="wrap footer-inner">
        <div><p class="eyebrow">Contact</p><h2>Get in touch</h2>
          {link("Connect on " + contact["label"], contact["url"])}
        </div>
        <div class="footer-right">
          {links(other_profiles, "footer-profiles")}
          <p>{e(PERSON["name"])} · {e(PERSON["institution"])}</p>
        </div>
      </div>
    </footer>'''


def structured_profile():
    return {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "url": ORIGIN + "/",
        "mainEntity": {
            "@type": "Person", "@id": ORIGIN + "/#person", "name": PERSON["name"],
            "url": ORIGIN + "/", "image": ORIGIN + "/assets/portrait-800.webp",
            "affiliation": {"@type": "CollegeOrUniversity", "name": PERSON["institution"]},
            "jobTitle": PERSON["identity"], "description": PERSON["intro"],
            "sameAs": [profile["url"] for profile in PERSON["profiles"]]
        }
    }


def page(route, title, description, body, structured=None, canonical=None, indexable=True):
    canonical = ORIGIN + (canonical or route)
    title = f"{title} | {PERSON['name']}" if route != "/" else f"{PERSON['name']} | Biomedical Engineering & Research"
    robots = "" if indexable else '<meta name="robots" content="noindex,follow">'
    schema = "" if structured is None else (
        '<script type="application/ld+json">' + json.dumps(structured, ensure_ascii=True).replace("<", "\\u003c") + "</script>"
    )
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
  <meta name="description" content="{e(description)}">
  <link rel="canonical" href="{e(canonical)}">
  {robots}
  <meta property="og:type" content="{'profile' if route == '/' else 'website'}">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:url" content="{e(canonical)}">
  <meta property="og:site_name" content="{e(PERSON['name'])}">
  <meta property="og:image" content="{ORIGIN}/assets/social-preview.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Steven Di Jorio beside his CURE research poster">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/icon.png" type="image/png">
  <link rel="stylesheet" href="/assets/site.css">
  <script src="/assets/navigation.js" defer></script>
  {schema}
</head>
<body>
  {header(route)}
  <main id="main" tabindex="-1">
    {body}
  </main>
  {footer()}
</body>
</html>
'''


def portrait():
    sizes = "(max-width: 630px) min(calc(100vw - 40px), 384px), (max-width: 900px) 36vw, 424px"
    return f'''<figure class="hero-portrait">
      <picture>
        <source type="image/avif" srcset="/assets/portrait-460.avif 460w, /assets/portrait-800.avif 800w" sizes="{sizes}">
        <img src="/assets/portrait-460.webp" srcset="/assets/portrait-460.webp 460w, /assets/portrait-800.webp 800w"
          sizes="{sizes}" width="460" height="460" alt="Portrait of Steven Di Jorio" fetchpriority="high">
      </picture>
      <figcaption>{e(PERSON["degree"])} <span>{e(PERSON["graduation"])}</span></figcaption>
    </figure>'''


def poster(caption=False):
    credit = '<figcaption>Presenting bile duct OCT research at the 2025 CURE Summer Research Symposium.</figcaption>' if caption else ""
    sizes = "(max-width: 630px) calc(100vw - 40px), (max-width: 900px) 54vw, 660px"
    return f'''<figure class="poster">
      <picture>
        <source type="image/avif" srcset="/assets/cure-poster-600.avif 600w, /assets/cure-poster-1200.avif 1200w" sizes="{sizes}">
        <img src="/assets/cure-poster-600.webp" srcset="/assets/cure-poster-600.webp 600w, /assets/cure-poster-1200.webp 1200w"
          sizes="{sizes}" width="600" height="400" loading="lazy"
          alt="Steven Di Jorio stands beside his poster on optical coherence tomography for bile duct evaluation">
      </picture>
      {credit}
    </figure>'''


def dataset_figure():
    return '''<figure class="poster dataset-figure">
      <img src="/assets/red-blood-cell-segmentation-reference.webp" width="752" height="568" loading="lazy"
        alt="Three rows show blood-smear images, detected red blood cells, segmentation masks, and the corresponding overlays.">
      <figcaption>Reference figure from the dataset study. It shows how red blood cells were segmented before release of the cell images used in this project.
        <a href="https://pubmed.ncbi.nlm.nih.gov/29682411/">Rajaraman et al. (2018), figure 2</a> ·
        <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>.
      </figcaption>
    </figure>'''


def bridge(caption=True):
    credit = '<figcaption>Breadboard used while troubleshooting the wearable sensor’s Wheatstone bridge.</figcaption>' if caption else ""
    return f'''<figure class="poster">
      <picture>
        <source type="image/avif" srcset="/assets/bridge-prototype.avif">
        <img src="/assets/bridge-prototype.webp" width="980" height="679" loading="lazy"
          alt="Breadboard circuit with resistors, jumper wires, and a blue trimmer">
      </picture>
      {credit}
    </figure>'''


def compact_case(record, path):
    return f'''<article class="compact-case">
      <p class="eyebrow">{e(record["affiliation"].split(" · ")[0])}</p>
      <h3>{link(record["title"], path + "#" + record["id"], "heading-link")}</h3>
      <p>{e(record["summary"])}</p>
    </article>'''


def home():
    featured = CONTENT["featured"]
    research = {item["id"]: item for item in CONTENT["research"]}
    engineering = {item["id"]: item for item in CONTENT["engineering"]}
    first, *additional_research = [research[key] for key in featured["research"]]
    projects = [engineering[key] for key in featured["engineering"]]
    paper = next(item for item in CONTENT["publications"] if item["id"] == featured["publication"])
    other_research = "".join(compact_case(item, "/research/") for item in additional_research)
    bench_project = next((item for item in projects if item["id"] == "wearable-sensor"), None)
    engineering_list = "".join(compact_case(item, "/engineering/") for item in projects if item != bench_project)
    if bench_project:
        engineering_section = f'''<div class="bench-layout">
          <div class="bench-feature">{bridge(False)}{compact_case(bench_project, "/engineering/")}</div>
          <div class="secondary-work">{engineering_list}</div>
        </div>'''
    else:
        engineering_section = f'<div class="compacts three">{engineering_list}</div>'
    return f'''<section class="hero-shell" id="hero" aria-labelledby="name">
      <div class="wrap hero">
      <div class="hero-copy" id="about">
        <p class="eyebrow hero-label">{e(PERSON["institution"])}</p>
        <h1 id="name">{e(PERSON["name"])}</h1>
        <p class="hero-role">{e(PERSON["identity"])}</p>
        <p class="hero-intro">{e(PERSON["intro"])}</p>
        <div class="actions">{action("Explore research", "/research/")}{action("View CV", "/cv/", True)}</div>
        {links(PERSON["profiles"], "profile-links")}
      </div>
      {portrait()}
      </div>
    </section>
    <nav class="evidence-nav" aria-label="Featured portfolio destinations">
      <ul class="wrap evidence-links">
        <li><a href="/publications/#{e(paper['id'])}"><strong>Published research</strong><span>IEEE proceedings</span></a></li>
        <li><a href="/engineering/"><strong>Engineering work</strong><span>Circuits and prototypes</span></a></li>
        <li><a href="/experience/#pemrap"><strong>Clinical experience</strong><span>Pediatric emergency medicine</span></a></li>
      </ul>
    </nav>
    <section class="research-band" id="research" aria-labelledby="home-research">
      <div class="wrap block">
        <div class="section-heading"><h2 id="home-research">Selected research</h2>{link("All research", "/research/")}</div>
        <div class="selected-work">
        <article class="featured">
          {poster()}
          <div>
            <p class="eyebrow">{e(first["affiliation"])}</p>
            <h3>{link(first["title"], "/research/#" + first["id"], "heading-link")}</h3>
            <p>{e(first["summary"])}</p>
            {link("Read the OCT case study", "/research/#" + first["id"])}
          </div>
        </article>
        <div class="secondary-work">{other_research}</div>
        </div>
      </div>
    </section>
    <section class="wrap block" id="projects" aria-labelledby="home-projects">
      <div class="section-heading"><h2 id="home-projects">Engineering projects</h2>{link("All engineering projects", "/engineering/")}</div>
      {engineering_section}
    </section>
    <section class="publication-band" aria-labelledby="home-paper">
      <div class="wrap spotlight">
        <div><p class="eyebrow">Published IEEE proceedings · 2026</p>
        <h2 id="home-paper">{link(paper["title"], "/publications/#" + paper["id"], "heading-link")}</h2></div>
        <div class="spotlight-links">{link("View citation", "/publications/#" + paper["id"])}
        {link("Open published paper", paper["links"][0]["url"])}</div>
      </div>
    </section>
    <section class="wrap block home-experience" id="awards" aria-labelledby="home-experience">
      <div class="section-heading"><h2 id="home-experience">Fellowships &amp; clinical research</h2>{link("View experience", "/experience/")}</div>
      <div class="compacts home-roles">
        <div>
          <h3>Research fellowships</h3>
          <ul>{''.join(f'<li>{e(item["title"])}</li>' for item in CONTENT["fellowships"])}</ul>
        </div>
        <div>
          <h3>Pediatric emergency medicine</h3>
          <p>{e(CONTENT["experience"][0]["description"])}</p>
          {link("Clinical research experience", "/experience/#pemrap")}
        </div>
      </div>
    </section>
    <aside class="wrap home-cv" id="resume" aria-label="Professional documents">
      <h2>Curriculum vitae</h2>{action("View and download", "/cv/", True)}
    </aside>'''


def contents(items, label):
    return f'<nav class="contents" aria-label="{e(label)}"><p class="eyebrow">On this page</p>' + links(
        [{"label": item["title"], "url": "#" + item["id"]} for item in items]
    ) + "</nav>"


def workflow_figure(workflow):
    steps = "".join(f'<li><strong>{e(label)}</strong><span>{e(detail)}</span></li>'
                    for label, detail in workflow["steps"])
    return f'''<figure class="workflow-figure">
      <figcaption><strong>{e(workflow["title"])}</strong>{e(workflow["caption"])}</figcaption>
      <ol>{steps}</ol>
    </figure>'''


def case_study(item, asset=""):
    tags = "".join(f"<li>{e(method)}</li>" for method in item["methods"])
    workflow = workflow_figure(item["workflow"]) if "workflow" in item else ""
    references = links(item["links"])
    if references:
        references = f'<h3>Sources &amp; related work</h3>{references}'
    return f'''<article class="case-study" id="{e(item['id'])}">
      <header><p class="eyebrow">{e(item['affiliation'])}</p>
        <h2>{e(item['title'])}</h2><p class="case-summary">{e(item['summary'])}</p>
      </header>
      <div class="case-layout">
        <div class="case-main">
          <p>{e(item['context'])}</p>
          <h3>My contribution</h3><p>{e(item['contribution'])}</p>
          {workflow}{asset}
          <h3>Outcome and status</h3><p>{e(item['outcome'])}</p>
          <h3>Limitations</h3><p>{e(item['limit'])}</p>
        </div>
        <aside class="case-evidence">
          <h3>Methods &amp; tools</h3>
          <ul class="method-list">{tags}</ul>
          {references}
        </aside>
      </div>
    </article>'''


def case_page(collection, title, intro, assets):
    items = CONTENT[collection]
    return heading("", title, intro) + f'''<div class="wrap editorial-layout">
      {contents(items, f"{title} on this page")}
      <div>{''.join(case_study(item, assets.get(item["id"], "")) for item in items)}</div>
    </div>'''


def authors(item):
    ordered = (
        f'<strong>{e(name)}</strong>' if name == item.get("person-author", "") else e(name)
        for name in item["authors"]
    )
    return f'<p class="authors">{", ".join(ordered)}</p>' if item["authors"] else ""


def publications():
    groups = defaultdict(list)
    for item in CONTENT["publications"]:
        groups[item["type"]].append(item)
    sections = []
    for label, records in groups.items():
        citations = "".join(
            f'''<article class="citation" id="{e(item["id"])}">
              <h3>{e(item['title'])}</h3>
              {authors(item)}
              <p class="citation-venue">{e(item['venue'])} <span>·</span> {e(item['details'])}</p>
              {links(item['links'])}
            </article>'''
            for item in sorted(records, key=lambda item: item["date"], reverse=True)
        )
        sections.append(f'<section class="citation-group"><h2>{e(label)}</h2><div>{citations}</div></section>')
    return heading("Scholarship", "Publications & presentations", "Peer-reviewed proceedings, conference abstracts, and research posters.") + '<div class="wrap listing">' + "".join(sections) + "</div>"


def scholarly_schema():
    records = []
    for item in CONTENT["publications"]:
        if "doi" not in item:
            continue
        article = {
            "@type": "ScholarlyArticle", "@id": ORIGIN + "/publications/#" + item["id"],
            "name": item["title"], "datePublished": item["date"],
            "sameAs": [reference["url"] for reference in item["links"]],
            "identifier": item["doi"],
            "author": [
                {"@type": "Person", "name": name, **({"@id": ORIGIN + "/#person"} if name == item["person-author"] else {})}
                for name in item["authors"]
            ],
            "isPartOf": {"@type": "CreativeWork", "name": item["venue"]}
        }
        if "pages" in item:
            article["pagination"] = item["pages"]
        records.append(article)
    return {"@context": "https://schema.org", "@graph": records}


def experience():
    timeline = "".join(
        f'''<article class="timeline-item" id="{e(item["id"])}">
          <p class="eyebrow">{e(item["date"])}</p><div>
          <h3>{e(item["title"])}</h3><p class="where">{e(item["organization"])}</p>
          <p>{e(item["description"])}</p>{links(item["links"])}</div>
        </article>''' for item in CONTENT["experience"]
    )
    fellowships = "".join(
        f'''<article class="timeline-item"><p class="eyebrow">{e(item["date"])}</p><div>
          <h3>{e(item["title"])}</h3><p>{e(item["description"])}</p>
          {link(item["link"]["label"], item["link"]["url"])}</div></article>'''
        for item in CONTENT["fellowships"]
    )
    skills = "".join(
        f'''<article class="competency"><h3>{e(item["title"])}</h3>
          <p>{e(item["description"])}</p>{link(item["link"]["label"], item["link"]["url"])}</article>'''
        for item in CONTENT["competencies"]
    )
    return heading("Background", "Experience", "Research, clinical study support, and engineering teaching at the University of Oklahoma.") + f'''
      <div class="wrap editorial-layout">
        <nav class="contents" aria-label="Experience on this page"><p class="eyebrow">On this page</p>{links([
            {"label": "Education", "url": "#education"},
            {"label": "Clinical research", "url": "#pemrap"},
            {"label": "Research, teaching & service", "url": "#roles"},
            {"label": "Fellowships", "url": "#fellowships"},
            {"label": "Technical competencies", "url": "#competencies"},
        ])}</nav>
        <div>
          <section class="experience-section" id="education">
            <h2>Education</h2><p class="where">{e(PERSON["institution"])}</p>
            <p>{e(PERSON["degree"])} · {e(PERSON["minor"])} · {e(PERSON["graduation"])}</p>
          </section>
          <section class="experience-section" id="roles"><h2>Research, teaching &amp; service</h2>{timeline}</section>
          <section class="experience-section" id="fellowships"><h2>Research fellowships</h2>{fellowships}</section>
          <section class="experience-section" id="competencies"><h2>Technical competencies</h2><div class="competencies">{skills}</div></section>
        </div>
      </div>'''


def cv_records(collection, selection):
    by_id = {item["id"]: item for item in CONTENT[collection]}
    return [by_id[identifier] for identifier in CV[selection]]


def cv_entry(title, description, meta=""):
    metadata = f'<p class="cv-meta">{e(meta)}</p>' if meta else ""
    return f'<div class="cv-entry"><h3>{e(title)}</h3>{metadata}<p>{e(description)}</p></div>'


def cv_role(role):
    meta = " · ".join(role[key] for key in ("organization", "date") if key in role)
    return cv_entry(role["title"], role["description"], meta)


def cv():
    scholarship = "".join(
        f'''<div class="cv-entry">
          <h3>{e(item["title"])}</h3>{authors(item)}
          <p class="cv-meta">{e(item["venue"])} · {e(item["details"])}</p>
          {links(item["links"][:1])}
        </div>'''
        for item in cv_records("publications", "publication_ids")
    )
    sections = [
        ("education", "Education", cv_entry(PERSON["institution"],
            f'{PERSON["degree"]} · {PERSON["minor"]}. {PERSON["graduation"]}.')),
        ("research-experience", "Research experience", "".join(cv_role(role) for role in CV["research"])),
        ("scholarly-work", "Selected scholarly work", scholarship),
        ("engineering-projects", "Selected engineering projects", "".join(
            cv_entry(project["title"], project["contribution"]) for project in CONTENT["engineering"]
        )),
        ("clinical-research-and-service", "Clinical research, teaching, and service", "".join(
            cv_role(role) for role in cv_records("experience", "experience_ids")
        )),
        ("fellowships", "Research fellowships", '<ul class="cv-fellowships">' + "".join(
            f'<li><strong>{e(record["title"])}</strong> · {e(record["date"])}</li>'
            for record in CONTENT["fellowships"]
        ) + "</ul>"),
        ("methods", "Selected methods and tools", f'<p>{e(CV["methods"])}</p>'),
    ]
    index = contents([{"id": identifier, "title": label} for identifier, label, _ in sections], "CV sections")
    body = "".join(
        f'<section class="cv-section" id="{identifier}"><h2>{e(label)}</h2>{details}</section>'
        for identifier, label, details in sections
    )
    return heading(PERSON["name"], "Curriculum vitae") + f'''
      <div class="wrap document-layout">
        <div class="document-card">
          <p>Updated {e(CV["updated"])}</p>
          {action("Download CV (PDF)", CV["path"], download=True)}
        </div>
      </div>
      <div class="wrap editorial-layout cv-layout">
        {index}
        <div>{body}</div>
      </div>'''


def review():
    panels = "".join(
        f'''<details class="reading-panel" id="{e(item['id'])}"{' open' if index == 0 else ''}>
          <summary>{e(item["title"])}</summary>
          <div><p>{e(item["text"])}</p>{links([RESOURCES["sources"][item["source"]]])}</div>
        </details>''' for index, item in enumerate(RESOURCES["review"])
    )
    return heading("Interactive literature review", "Peribiliary glands & cystic dilation",
                   "A source-linked overview of gland anatomy, interpretation of cystic dilation, and open research questions.") + f'''
      <div class="wrap reading-layout">
        {panels}
        <p class="reading-note">{link("Explore the transplant injury overview", "/infographic.html")} · {link("Return to the OCT case study", "/research/#bile-duct-oct")}</p>
      </div>'''


def overview():
    topics = "".join(f'''<article class="compact-case"><h2>{link(item["title"], item["path"], "heading-link")}</h2>
      <p>{e(item["text"])}</p></article>''' for item in RESOURCES["topics"])
    return heading("Educational research resource", "Biliary injury in liver transplantation",
                   "Six short, source-linked topics on gland injury, transplant complications, and how researchers study them.") + f'''
      <div class="wrap overview-grid">{topics}</div>
      <div class="wrap reading-note">{link("Interactive peribiliary gland review", "/what_is_beales_sacculi.html")} · {link("OCT case study", "/research/#bile-duct-oct")}</div>'''


def topic(item):
    return heading("Biliary injury in liver transplantation", item["title"]) + f'''
      <div class="wrap reading-layout prose">
        <p>{e(item["text"])}</p>
        <h2>Sources</h2>{links([RESOURCES["sources"][key] for key in item["sources"]])}
        <p class="reading-note">{link("Biliary injury overview", "/infographic.html")} · {link("Peribiliary gland review", "/what_is_beales_sacculi.html")}</p>
      </div>'''


def alias():
    return '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peribiliary gland review | Steven Di Jorio</title>
<link rel="canonical" href="https://stevendijorio.com/what_is_beales_sacculi.html">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0;url=/what_is_beales_sacculi.html">
</head>
<body><main><h1>Peribiliary gland review</h1>
<p><a href="/what_is_beales_sacculi.html">Continue to the interactive literature review</a>.</p></main></body>
</html>
'''


def validate():
    seen = set()
    for group in ("research", "engineering", "experience", "publications"):
        for item in CONTENT[group]:
            identifier = item["id"]
            if identifier in seen or re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier) is None:
                raise ValueError(f"Invalid or duplicate record ID {identifier!r}")
            seen.add(identifier)
            if not item["title"].strip():
                raise ValueError(f"Missing title for {identifier}")
            if group in ("research", "engineering"):
                for field in ("summary", "context", "contribution", "methods", "outcome", "limit"):
                    if not item[field]:
                        raise ValueError(f"Missing {field} for {identifier}")
            if group == "publications":
                if len(item["date"]) > 4:
                    value = item["date"]
                    date.fromisoformat(value + "-01" if len(value) == 7 else value)
                if item["authors"] and item.get("person-author") not in item["authors"]:
                    raise ValueError(f"Portfolio author missing from {identifier}")
                if item["type"] == "Published conference proceedings" and "doi" not in item:
                    raise ValueError(f"Missing DOI for {identifier}")

    def check_urls(value):
        if isinstance(value, dict):
            if "url" in value:
                address = value["url"]
                parts = urlsplit(address)
                if not ((address.startswith(("/", "#")) and not parts.netloc) or (parts.scheme == "https" and parts.netloc)):
                    raise ValueError(f"Invalid link: {address}")
            for child in value.values():
                check_urls(child)
        elif isinstance(value, list):
            for child in value:
                check_urls(child)

    check_urls(CONTENT)
    check_urls(RESOURCES)
    for collection in ("research", "engineering"):
        available = {item["id"] for item in CONTENT[collection]}
        featured = CONTENT["featured"][collection]
        if not featured or set(featured) - available:
            raise ValueError(f"Check homepage selections for {collection}")
    if not any(item["id"] == CONTENT["featured"]["publication"] for item in CONTENT["publications"]):
        raise ValueError("Check the homepage publication selection")
    if not (ROOT / CV["path"].lstrip("/")).is_file():
        raise ValueError("The public CV path must point to an existing file")


def render():
    validate()
    research_intro = "Optical imaging for transplantation and computational experiments for resource-constrained inference."
    engineering_intro = "Circuit design, sensor troubleshooting, and assistive device prototyping."
    rendered = {
        "/": page("/", "Home", HOME_DESCRIPTION, home(), structured_profile()),
        "/research/": page("/research/", "Research", research_intro, case_page("research", "Research", research_intro, {"bile-duct-oct": poster(True), "edge-imaging": dataset_figure()})),
        "/engineering/": page("/engineering/", "Engineering", engineering_intro, case_page("engineering", "Engineering projects", engineering_intro, {"wearable-sensor": bridge()})),
        "/publications/": page("/publications/", "Publications & presentations", "Steven Di Jorio’s published IEEE proceedings paper, END2CANCER abstract, and research posters.", publications(), scholarly_schema()),
        "/experience/": page("/experience/", "Experience", "Education, clinical and research experience, fellowships, and technical competencies.", experience()),
        "/cv/": page("/cv/", "Curriculum vitae", "Read Steven Di Jorio’s curriculum vitae online or download the PDF.", cv()),
        "/what_is_beales_sacculi.html": page("/what_is_beales_sacculi.html", "Peribiliary glands & cystic dilation", "An interactive, sourced review of peribiliary glands, cystic dilation, and imaging.", review()),
        "/infographic.html": page("/infographic.html", "Biliary injury in liver transplantation", "A source-linked overview of peribiliary glands and biliary injury after liver transplantation.", overview()),
        "/cystic_dilation_review/": alias(),
    }
    for item in RESOURCES["topics"]:
        route = item["path"]
        rendered[route] = page(route, item["title"], item["text"], topic(item))
    sitemap_urls = "".join(f"  <url><loc>{ORIGIN}{e(route)}</loc></url>\n" for route in rendered if route != "/cystic_dilation_review/")
    rendered["/sitemap.xml"] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemap_urls + "</urlset>\n"
    rendered["/robots.txt"] = f"User-agent: *\nAllow: /\nSitemap: {ORIGIN}/sitemap.xml\n"
    return {route: "\n".join(line.rstrip() for line in body.splitlines()) + "\n" for route, body in rendered.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Fail if checked-in Pages outputs need regeneration.")
    mode.add_argument("--output", type=Path, help="Write an isolated preview to a fresh directory.")
    args = parser.parse_args()
    destination_root = args.output.resolve() if args.output else ROOT
    if args.output and destination_root.exists() and any(destination_root.iterdir()):
        parser.exit(1, "Choose an empty preview directory.\n")
    stale = []
    for route, body in render().items():
        destination = destination_root / (route.lstrip("/") + ("index.html" if route.endswith("/") else ""))
        if args.check:
            if not destination.exists() or destination.read_text() != body:
                stale.append(str(destination.relative_to(ROOT)))
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(body)
    if args.output:
        shutil.copytree(ROOT / "assets", destination_root / "assets")
        for name in ("CNAME", "brawl.stars.html", "cure_research.jpg"):
            shutil.copyfile(ROOT / name, destination_root / name)
    if stale:
        parser.exit(1, "Stale generated output: " + ", ".join(stale) + "\n")
    print("Checked GitHub Pages output." if args.check else "Built GitHub Pages output.")


if __name__ == "__main__":
    main()
