"""
Gerador de PDF do FLUXOS.md - Versao final robusta.
Estrategia:
  1. Baixa cada diagrama Mermaid do mermaid.ink como JPEG (ja confirmado funciona)
  2. Salva em disco temporario
  3. Substitui blocos mermaid por referencias de imagem relativas no markdown
  4. Passa root=TEMP_DIR para o Section do markdown_pdf
  5. Nao faz cleanup ate DEPOIS do PDF estar salvo
"""
import os
import sys
import re
import base64
import requests
import shutil
from pathlib import Path
from markdown_pdf import MarkdownPdf, Section

BASE_DIR = Path(__file__).parent
MD_FILE  = BASE_DIR / "FLUXOS.md"
PDF_FILE = BASE_DIR / "docs" / "FLUXOS_Praxis.pdf"
IMG_DIR  = BASE_DIR / "docs" / "_diagrams"   # pasta permanente de imagens

CUSTOM_CSS = """
body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    line-height: 1.7;
}
h1 {
    font-family: Georgia, serif;
    font-size: 22pt;
    color: #0a0a0a;
    border-bottom: 3px solid #c9a84c;
    padding-bottom: 8px;
    margin-top: 0;
}
h2 {
    font-family: Georgia, serif;
    font-size: 15pt;
    color: #1a1a1a;
    border-left: 4px solid #c9a84c;
    padding-left: 12px;
    margin-top: 32px;
    margin-bottom: 12px;
}
h3 { font-size: 12pt; font-weight: 600; color: #333; margin-top: 18px; }
p { margin: 8px 0; text-align: justify; }
code {
    font-family: Consolas, monospace;
    font-size: 9pt;
    background: #f5f3ee;
    padding: 2px 5px;
    border-radius: 3px;
    color: #7a3b10;
}
pre {
    font-family: Consolas, monospace;
    font-size: 9pt;
    background: #f5f3ee;
    border: 1px solid #d4c4a0;
    border-left: 4px solid #c9a84c;
    padding: 12px 16px;
    border-radius: 4px;
    line-height: 1.5;
}
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
th { background: #1a1a1a; color: #c9a84c; padding: 8px 12px; text-align: left; font-size: 9pt; }
td { padding: 8px 12px; border-bottom: 1px solid #e8e0d0; vertical-align: top; }
tr:nth-child(even) td { background: #faf8f4; }
img {
    width: 100%;
    max-width: 100%;
    height: auto;
    display: block;
    margin: 24px 0;
    page-break-inside: avoid;
}
hr { border: none; border-top: 1px solid #d4c4a0; margin: 28px 0; }
ul, ol { margin: 8px 0; padding-left: 24px; }
li { margin: 4px 0; }
strong { font-weight: 700; }
blockquote { border-left: 4px solid #c9a84c; padding: 8px 16px; background: #faf8f4; margin: 12px 0; }
"""


def fetch_diagram(code: str, index: int) -> bytes | None:
    """Baixa o diagrama Mermaid como JPEG do mermaid.ink."""
    encoded = base64.urlsafe_b64encode(code.encode("utf-8")).decode("ascii")
    url = f"https://mermaid.ink/img/{encoded}"
    print(f"   -> Diagrama #{index+1}...", end=" ", flush=True)
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        content = r.content
        if content[:3] == b"\xff\xd8\xff":
            print(f"OK ({len(content)//1024} KB)")
            return content
        print(f"formato invalido ({content[:10]!r})")
        return None
    except Exception as e:
        print(f"ERRO: {e}")
        return None


def process_markdown(md_text: str) -> tuple[str, list[Path]]:
    """
    Substitui blocos mermaid por imagens salvas em IMG_DIR.
    Retorna (md_modificado, lista_de_arquivos_gerados).
    """
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    pattern = re.compile(r"```mermaid\n(.*?)```", re.DOTALL)
    matches = list(pattern.finditer(md_text))
    saved_files = []

    print(f"[i] {len(matches)} diagramas encontrados.")
    print("[IMG] Baixando via mermaid.ink...")
    print()

    # Coleta todos os PNGs primeiro
    imgs: list[Path | None] = []
    for i, match in enumerate(matches):
        code = match.group(1).strip()
        data = fetch_diagram(code, i)
        if data:
            img_path = IMG_DIR / f"diagram_{i:02d}.jpg"
            img_path.write_bytes(data)
            imgs.append(img_path)
            saved_files.append(img_path)
        else:
            imgs.append(None)

    print()

    # Substitui de tras pra frente para preservar indices
    result = md_text
    for i, match in enumerate(reversed(matches)):
        idx = len(matches) - 1 - i
        img_path = imgs[idx]

        if img_path and img_path.exists():
            # Usa caminho relativo a partir de IMG_DIR -> BASE_DIR
            rel = img_path.relative_to(BASE_DIR).as_posix()
            replacement = f"\n![Diagrama {idx+1}]({rel})\n"
        else:
            replacement = (
                f"\n> **[Diagrama {idx+1} nao disponivel]**\n"
            )
        result = result[:match.start()] + replacement + result[match.end():]

    return result, saved_files


def build_pdf(md_text: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    print("[*] Convertendo para PDF...")
    pdf = MarkdownPdf(toc_level=2)
    sec = Section(
        text=md_text,
        toc=True,
        root=str(BASE_DIR),   # raiz para resolver caminhos relativos de imagens
        paper_size="A4",
        borders=(40, 40, -40, -40),
    )
    pdf.add_section(sec, user_css=CUSTOM_CSS)
    print(f"[>] Salvando: {output}")
    pdf.save(str(output))


def main():
    print("=" * 55)
    print("  PRAXIS -- Gerador de PDF com Diagramas")
    print("=" * 55)
    print()

    if not MD_FILE.exists():
        print(f"[!] {MD_FILE} nao encontrado.")
        sys.exit(1)

    with open(MD_FILE, encoding="utf-8") as f:
        md_text = f.read()
    print(f"[+] Lido: {MD_FILE.name} ({len(md_text)//1024} KB)\n")

    # Passo 1: processar diagramas
    processed, files = process_markdown(md_text)

    # Passo 2: gerar PDF (imagens ainda no disco)
    try:
        build_pdf(processed, PDF_FILE)
        size = PDF_FILE.stat().st_size / 1024
        print()
        print("=" * 55)
        print("  [OK] PDF gerado!")
        print(f"  Arquivo: {PDF_FILE}")
        print(f"  Tamanho: {size:.0f} KB")
        print("=" * 55)
    except Exception as e:
        import traceback
        print(f"\n[!] ERRO: {e}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Limpa apenas apos o PDF ser salvo com sucesso
        if IMG_DIR.exists():
            shutil.rmtree(IMG_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
