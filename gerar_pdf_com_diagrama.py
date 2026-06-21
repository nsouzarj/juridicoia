import base64
import re
import requests
from markdown_pdf import MarkdownPdf, Section

def get_mermaid_image_base64(mermaid_code):
    clean_code = "\n".join([line for line in mermaid_code.split("\n") if line.strip() != ""])
    b64_url = base64.urlsafe_b64encode(clean_code.encode('utf-8')).decode('utf-8')
    url = f"https://mermaid.ink/img/{b64_url}?bgColor=FFFFFF"
    
    print(f"Baixando diagrama da URL: {url[:50]}...")
    response = requests.get(url)
    if response.status_code == 200:
        img_b64 = base64.b64encode(response.content).decode('utf-8')
        return img_b64
    else:
        print(f"Erro ao baixar imagem: {response.status_code}")
        return None

def main():
    caminho_md = r"C:\Users\nsouz\.gemini\antigravity\brain\0162eeb6-8ce5-41bd-aa6b-bdfe5966d467\arquitetura_rag_jurisprudencia.md"
    caminho_pdf = r"d:\Projetos\craia\skill_juridica\Arquitetura_RAG_Jurisprudencia_Com_Fluxo.pdf"
    
    with open(caminho_md, "r", encoding="utf-8") as f:
        conteudo = f.read()
        
    conteudo = conteudo.replace("> [!IMPORTANT]", "")
    conteudo = conteudo.replace("> [!WARNING]", "")
    
    pattern = r'```mermaid(.*?)```'
    matches = re.finditer(pattern, conteudo, re.DOTALL)
    
    for match in matches:
        mermaid_code = match.group(1).strip()
        img_base64 = get_mermaid_image_base64(mermaid_code)
        
        if img_base64:
            # Força quebra de página antes e aumenta a imagem para preencher 100% da largura
            img_tag = f'<div style="page-break-before: always;"></div><br/><h2>Diagrama da Arquitetura RAG</h2><img src="data:image/png;base64,{img_base64}" style="width: 100%; height: auto;" />'
            conteudo = conteudo.replace(match.group(0), img_tag)

    print("Convertendo Markdown para PDF com página inteira...")
    pdf = MarkdownPdf(toc_level=2)
    pdf.add_section(Section(conteudo))
    pdf.save(caminho_pdf)
    print(f"PDF com diagrama grande gerado: {caminho_pdf}")

if __name__ == "__main__":
    main()
