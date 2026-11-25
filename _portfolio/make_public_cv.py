#!/usr/bin/env python3
"""Create the sanitized, website-only CV from selected public portfolio records."""

import os
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from build import CONTENT, CV, ORIGIN, PERSON, ROOT, e

INK = colors.HexColor("#172136")
BODY = colors.HexColor("#344057")
BLUE = colors.HexColor("#263da7")
LINE = colors.HexColor("#c9d1e4")

STYLES = {
    "name": ParagraphStyle("name", fontName="Times-Roman", fontSize=31, leading=35, textColor=INK),
    "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=BLUE),
    "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=15, spaceAfter=5,
                              textColor=BLUE, keepWithNext=True),
    "entry": ParagraphStyle("entry", fontName="Helvetica-Bold", fontSize=10.6, leading=14, textColor=INK,
                            spaceBefore=6, spaceAfter=1, keepWithNext=True),
    "body": ParagraphStyle("body", fontName="Helvetica", alignment=TA_LEFT, fontSize=10.1, leading=14.5,
                           textColor=BODY, spaceAfter=3, splitLongWords=False),
}

story = []


def add(text, style="body"):
    story.append(Paragraph(text, STYLES[style]))


def section(title):
    add(e(title), "section")


def item(title, description):
    add(e(title), "entry")
    add(e(description))


def web(label, url):
    return f'<link href="{e(url)}" color="#263da7">{e(label)}</link>'


def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(53, 42, letter[0] - 53, 42)
    canvas.setFillColor(BODY)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(53, 28, f'{PERSON["name"]}  |  Curriculum vitae')
    canvas.drawRightString(letter[0] - 53, 28, str(doc.page))
    canvas.restoreState()


def make():
    os.environ["SOURCE_DATE_EPOCH"] = str(int(datetime.fromisoformat(CV["modified"]).replace(tzinfo=timezone.utc).timestamp()))
    add(e(PERSON["name"]), "name")
    add("CURRICULUM VITAE", "label")
    story.append(Spacer(1, 5))
    add(f'{web("stevendijorio.com", ORIGIN)}  |  Updated {e(CV["updated"])}')
    section("Education")
    item(PERSON["institution"], f'{PERSON["degree"]} · {PERSON["minor"]}. {PERSON["graduation"]}.')
    section("Research experience")
    item("Undergraduate Researcher | INQUIRE Lab",
         "Design and evaluate analog spiking-neuron circuits, compare bench measurements with simulations, "
         "and develop controlled computational benchmarks for edge inference.")
    item("Provost’s Summer UReCA Fellow | INQUIRE Lab | Summer 2026",
         "Built a reproducible Python preprocessing pipeline for public microscopy images and evaluated "
         "TensorFlow Lite model quantization under matched CPU benchmark conditions.")
    item("CURE Research Fellow | Tang Biophotonic Imaging Lab | Summer 2025",
         "Processed and annotated donor bile duct optical coherence tomography scans, reviewed acquisition "
         "metadata, and extracted tissue features. Presented at the CURE symposium and OU UReCA Showcase.")
    section("Selected scholarly work")
    for record in CONTENT["publications"][:3]:
        byline = ", ".join(f"<b>{e(name)}</b>" if name == record["person-author"] else e(name) for name in record["authors"])
        add(e(record["title"]), "entry")
        add(f'{byline}. {e(record["venue"])}. {e(record["details"])}.')
        add(web(record["doi"], record["links"][0]["url"]) if "doi" in record else web(record["links"][0]["label"], record["links"][0]["url"]))

    story.append(PageBreak())
    add(e(PERSON["name"]), "name")
    add("CURRICULUM VITAE", "label")
    section("Selected engineering projects")
    for project in CONTENT["engineering"]:
        item(project["title"], project["contribution"])
    section("Clinical research, teaching, and service")
    for experience in CONTENT["experience"]:
        if experience["id"] in ("pemrap", "ta", "hospice", "camp"):
            item(f'{experience["title"]} | {experience["organization"]}', f'{experience["date"]}. {experience["description"]}')
    section("Research fellowships")
    for fellowship in CONTENT["fellowships"]:
        add(f'<b>{e(fellowship["title"])}</b> · {e(fellowship["date"])}.')
    section("Selected methods and tools")
    add("Python, MATLAB, TensorFlow Lite, ImageJ, REDCap, NGSpice, COMSOL, PCB assembly, oscilloscope and "
        "function-generator bench testing, CAD prototyping, and Arduino data acquisition.")

    output = ROOT / CV["path"].lstrip("/")
    output.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(
        str(output), pagesize=letter, leftMargin=53, rightMargin=53, topMargin=49, bottomMargin=56,
        title=f'{PERSON["name"]} - Public Curriculum Vitae', author=PERSON["name"], invariant=1,
    ).build(story, onFirstPage=page_footer, onLaterPages=page_footer)
    print(output.relative_to(ROOT))


if __name__ == "__main__":
    make()
