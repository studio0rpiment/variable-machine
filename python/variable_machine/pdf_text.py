"""The text of a PDF, page by page, as JSON, for the research bot.

    uv run --no-project --with pypdf python python/variable_machine/pdf_text.py <file.pdf>

Prints {"title": …, "author": …, "pages": ["…", "…"]}. pypdf reads the text a
PDF already holds; a scan with no text layer gives empty pages (nothing here
reads images). Run in a throwaway environment uv keeps in its own cache, so
nothing is installed in the project.
"""

import json
import sys

from pypdf import PdfReader


def main() -> None:
    reader = PdfReader(sys.argv[1])
    meta = reader.metadata or {}
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # one unreadable page shouldn't lose the rest
            pages.append("")
    print(json.dumps({"title": str(meta.get("/Title") or ""), "author": str(meta.get("/Author") or ""), "pages": pages}))


if __name__ == "__main__":
    main()
