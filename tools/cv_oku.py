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


MADDE = ("•", "▪", "●", "◦", "-", "–", "*")


def _pdf_sayfa(metin):
    """Satır sonu boşluklarını siler; madde satırının küçük harfle başlayan devamını maddeye ekler."""
    satirlar = [s.rstrip() for s in metin.splitlines()]
    out = []
    for s in satirlar:
        devam = s.strip()
        if (out and devam and devam[0].islower() and out[-1].lstrip().startswith(MADDE)
                and not devam.startswith(MADDE)):
            out[-1] = out[-1] + " " + devam
        else:
            out.append(s)
    return "\n".join(out).strip()


def pdf_oku(yol):
    import fitz  # PyMuPDF

    with fitz.open(yol) as doc:
        return "\n\n".join(f"<!-- sayfa {i} -->\n{_pdf_sayfa(s.get_text('text'))}" for i, s in enumerate(doc, 1))


def _w(ad):
    return f"{{{W_NS}}}{ad}"


def _paragraf(p):
    """Paragraf metni + markdown işareti (başlık, madde, numara)."""
    from docx.text.paragraph import Paragraph  # noqa: F401 (tip)

    metin = p.text.strip()
    if not metin:
        return ""
    stil = (p.style.name or "") if p.style is not None else ""
    if stil == "Title":
        return "# " + metin
    if stil.startswith("Heading"):
        duzey = "".join(ch for ch in stil if ch.isdigit()) or "1"
        return "#" * min(int(duzey) + 1, 6) + " " + metin
    numarali = stil.startswith("List Number")
    madde = stil.startswith("List") or p._p.find(f"{_w('pPr')}/{_w('numPr')}") is not None
    if metin.startswith(MADDE) and not numarali:
        return "- " + metin.lstrip("".join(MADDE)).strip()
    if numarali:
        return "1. " + metin
    if madde:
        return "- " + metin
    return metin


def _kutu_metni(el):
    """Metin kutusu (w:txbxContent) paragrafları. Word aynı kutuyu mc:Fallback içinde VML olarak tekrar yazar: atlanır."""
    out = []
    for kutu in el.iter(_w("txbxContent")):
        if any(a.tag.endswith("}Fallback") for a in kutu.iterancestors()):
            continue
        for p in kutu.iter(_w("p")):
            s = "".join(t.text or "" for t in p.iter(_w("t"))).strip()
            if s:
                out.append(s)
    return out


def _bloklar(kap, ust):
    """Bir kapsayıcının (gövde, hücre, üst bilgi) öğelerini belge sırasıyla metne çevirir; tablolar özyinelemeli."""
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    parca = []
    for el in kap.iterchildren():
        if el.tag == _w("p"):
            parca.append(_paragraf(Paragraph(el, ust)))
            parca.extend(_kutu_metni(el))
        elif el.tag == _w("tbl"):
            parca.extend(_tablo(Table(el, ust), ust))
    return [x for x in parca if x]


def _tablo(t, ust):
    """Tablo satırları '| a | b |'; hücre içindeki iç içe tablolar tablonun ardından ayrı satırlar olarak gelir."""
    from docx.table import Table

    satirlar, ic = [], []
    for row in t.rows:
        hucre, onceki = [], None
        for c in row.cells:  # birleşik hücre aynı nesneyi tekrar döndürür
            if c._tc is onceki:
                continue
            onceki = c._tc
            parcalar = []
            for el in c._tc.iterchildren():
                if el.tag == _w("tbl"):
                    ic.extend(_tablo(Table(el, c), c))
                elif el.tag == _w("p"):
                    from docx.text.paragraph import Paragraph
                    parcalar.append(_paragraf(Paragraph(el, c)))
                    parcalar.extend(_kutu_metni(el))
            hucre.append(" / ".join(x for x in parcalar if x).replace("|", "/"))
        if any(hucre):
            satirlar.append("| " + " | ".join(hucre) + " |")
    return ["\n".join(satirlar)] + ic if satirlar else ic


def _ust_alt(d, alt):
    """Bölümlerin üst ya da alt bilgileri (ilk sayfa, varsayılan, çift sayfa); önceki bölüme bağlı olan ve
    aynı parçayı paylaşan tekrarlar atlanır."""
    cift = d.settings.odd_and_even_pages_header_footer
    gorulen, parca = set(), []
    for i, s in enumerate(d.sections):
        adaylar = []
        if s.different_first_page_header_footer:
            adaylar.append(s.first_page_footer if alt else s.first_page_header)
        adaylar.append(s.footer if alt else s.header)
        if cift:
            adaylar.append(s.even_page_footer if alt else s.even_page_header)
        for h in adaylar:
            if i > 0 and h.is_linked_to_previous:
                continue
            try:
                parca_id = id(h.part)
            except Exception:  # tanımsız üst bilgi
                continue
            if parca_id in gorulen:
                continue
            gorulen.add(parca_id)
            parca.extend(_bloklar(h._element, h))
    return parca


def docx_oku(yol):
    import docx

    d = docx.Document(yol)
    parca = _ust_alt(d, alt=False) + _bloklar(d.element.body, d) + _ust_alt(d, alt=True)
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
