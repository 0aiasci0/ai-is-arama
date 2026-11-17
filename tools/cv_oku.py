"""CV ve belge metnini çıkarır: .pdf (PyMuPDF), .docx (python-docx), .txt/.md/.tex (düz okuma).

Kullanım:
  python tools/cv_oku.py <dosya> [<dosya> ...] [-o cikti.md]

DOCX: gövde belge sırasıyla okunur (paragraf + tablo); üst bilgi, alt bilgi ve metin kutuları da eklenir.
Metin çıkmazsa (taranmış PDF, boş belge) çıkış kodu 2 olur; OCR gerekir.
"""
import argparse
import os
import sys

EN_AZ_KARAKTER = 200  # bunun altı "boş çıkarım" sayılır
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def pdf_oku(yol):
    import fitz  # PyMuPDF

    with fitz.open(yol) as doc:
        return "\n\n".join(f"<!-- sayfa {i} -->\n{s.get_text('text').strip()}" for i, s in enumerate(doc, 1))


def _tablo(t):
    satirlar = []
    for row in t.rows:
        hucre, onceki = [], None
        for c in row.cells:  # birleşik hücre aynı nesneyi tekrar döndürür
            if c._tc is onceki:
                continue
            onceki = c._tc
            hucre.append(" ".join(p.text.strip() for p in c.paragraphs if p.text.strip()).replace("|", "/"))
        if any(hucre):
            satirlar.append("| " + " | ".join(hucre) + " |")
    return "\n".join(satirlar)


def _kutu_metni(el):
    """Metin kutusu (w:txbxContent) içindeki paragraflar."""
    out = []
    for kutu in el.iter(f"{{{W_NS}}}txbxContent"):
        for p in kutu.iter(f"{{{W_NS}}}p"):
            s = "".join(t.text or "" for t in p.iter(f"{{{W_NS}}}t")).strip()
            if s:
                out.append(s)
    return out


def docx_oku(yol):
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = docx.Document(yol)
    parca = []
    for s in d.sections:
        for p in s.header.paragraphs:
            if p.text.strip():
                parca.append(p.text.strip())
    for el in d.element.body.iterchildren():
        if el.tag == f"{{{W_NS}}}p":
            p = Paragraph(el, d)
            metin = p.text.strip()
            if metin:
                stil = (p.style.name or "") if p.style is not None else ""
                if stil.startswith("Heading"):
                    duzey = "".join(ch for ch in stil if ch.isdigit()) or "1"
                    metin = "#" * min(int(duzey) + 1, 6) + " " + metin
                elif stil.startswith("List"):
                    metin = "- " + metin
                parca.append(metin)
            parca.extend(_kutu_metni(el))
        elif el.tag == f"{{{W_NS}}}tbl":
            parca.append(_tablo(Table(el, d)))
    for s in d.sections:
        for p in s.footer.paragraphs:
            if p.text.strip():
                parca.append(p.text.strip())
    return "\n\n".join(x for x in parca if x)


def oku(yol):
    uz = os.path.splitext(yol)[1].lower()
    if uz == ".pdf":
        return pdf_oku(yol)
    if uz == ".docx":
        return docx_oku(yol)
    if uz in (".txt", ".md", ".tex"):
        return open(yol, encoding="utf-8", errors="replace").read()
    if uz == ".doc":
        sys.exit(f"HATA: {yol}: eski .doc biçimi desteklenmez; Word'de .docx olarak kaydedin")
    sys.exit(f"HATA: {yol}: desteklenmeyen biçim {uz}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dosya", nargs="+")
    ap.add_argument("-o", "--cikti")
    a = ap.parse_args(argv)

    bolum, kod = [], 0
    for yol in a.dosya:
        metin = oku(yol)
        n = len("".join(metin.split()))
        if n < EN_AZ_KARAKTER:
            print(f"UYARI: {yol}: yalnız {n} karakter çıktı (taranmış PDF ya da boş belge); OCR gerekir",
                  file=sys.stderr, flush=True)
            kod = 2
        bolum.append(f"# {os.path.basename(yol)}\n\n{metin.strip()}\n")
    sonuc = "\n\n".join(bolum)
    if a.cikti:
        with open(a.cikti, "w", encoding="utf-8") as fh:
            fh.write(sonuc)
        print(f"{a.cikti}: {len(sonuc)} karakter", flush=True)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(sonuc, flush=True)
    return kod


if __name__ == "__main__":
    sys.exit(main())
