from markdown_pdf import MarkdownPdf, Section
import sys

def main():
    if len(sys.argv) < 3:
        print("Uso: python gerar_pdf.py <caminho_md> <caminho_pdf>")
        sys.exit(1)
        
    caminho_md = sys.argv[1]
    caminho_pdf = sys.argv[2]
    
    with open(caminho_md, "r", encoding="utf-8") as f:
        conteudo = f.read()
        
    # Remove as tags do GitHub Alerts pq não são suportadas em todos os conversores de PDF
    conteudo = conteudo.replace("> [!IMPORTANT]", "")
    conteudo = conteudo.replace("> [!WARNING]", "")
    
    pdf = MarkdownPdf(toc_level=2)
    pdf.add_section(Section(conteudo))
    pdf.save(caminho_pdf)
    print(f"PDF gerado com sucesso em: {caminho_pdf}")

if __name__ == "__main__":
    main()
