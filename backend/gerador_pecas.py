import json
import os
import openrouter_client
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from dotenv import load_dotenv
from banco_dados import get_connection
from alimentar_jurisprudencia import gerar_embedding

def load_data(filepath='dados_processo.json'):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_legal_text(data):
    # Carrega chaves do .env
    # Load environment (if needed)
    load_dotenv()
    # No Gemini API key required; OpenRouter uses OPENROUTER_API_KEY from .env

    # If no OpenRouter API key is set, fallback to dummy text for testing
    if not os.getenv("OPENROUTER_API_KEY"):
        print("AVISO: OpenRouter API key not configured. Using placeholder text.")
        return (
            "[Texto Gerado pela IA - Fundamentação Jurídica Fictícia]\n"
            "Em relação ao mérito, não assiste razão à parte adversa. "
            "Conforme a jurisprudência pacífica, os fatos narrados configuram "
            "culpa exclusiva da vítima, quebrando o nexo de causalidade.",

            "[Texto Gerado pela IA - Pedidos Fictícios]\n"
            "a) O acolhimento das preliminares;\n"
            "b) A total improcedência dos pedidos da inicial;\n"
            "c) A condenação em honorários sucumbenciais de 20%."
        )

    # Busca Jurisprudência RAG
    jurisprudencias_rag = ""
    fatos_vetor = gerar_embedding(data['resumo_fatos'])
    
    if fatos_vetor:
        conn = get_connection()
        if conn:
            # Postgres espera o array em formato string
            vetor_str = f"[{','.join(map(str, fatos_vetor))}]"
            materia = data.get('materia', 'Geral')
            query_rag = """
            SELECT tribunal, processo_referencia, ementa 
            FROM base_jurisprudencia 
            WHERE materia = %s
            ORDER BY embedding <-> %s LIMIT 3;
            """
            try:
                with conn.cursor() as cursor:
                    cursor.execute(query_rag, (materia, vetor_str))
                    resultados = cursor.fetchall()
                    if resultados:
                        jurisprudencias_rag = "\n\nJURISPRUDÊNCIA OBRIGATÓRIA A SER UTILIZADA (RAG):\n"
                        for t, p, e in resultados:
                            jurisprudencias_rag += f"[{t} - Processo {p}]: {e}\n\n"
            except Exception as e:
                print(f"Erro na busca vetorial RAG: {e}")
            finally:
                conn.close()

    # Pode usar o modelo gemini-1.5-flash para rapidez ou gemini-1.5-pro para melhor raciocínio
    # Build prompts for OpenRouter chat completion
    prompt_fundamentacao = f"""
Você é um advogado sênior especialista em direito brasileiro.
Baseado nos fatos e nas teses listadas abaixo, redija apenas a FUNDAMENTAÇÃO JURÍDICA de uma {data['tipo_peca']}.

REGRA CRÍTICA DE ANTI-ALUCINAÇÃO:
Se houver 'JURISPRUDÊNCIA OBRIGATÓRIA' listada abaixo, você SÓ PODE utilizar esses julgados exatos para fundamentar sua tese. NÃO invente números de processos, nem relatores, nem cite jurisprudência de sua própria memória. Use apenas o que foi fornecido pelo banco de dados (RAG).

Formate em texto contínuo, sem markdown, pronto para ir para um documento Word.

Fatos: {data['resumo_fatos']}
Teses Principais:
{chr(10).join(f"- {t}" for t in data['teses_principais'])}

{jurisprudencias_rag}
"""
    prompt_pedidos = f"""
Você é um advogado sênior especialista em direito brasileiro.
Baseado na seguinte tese, redija apenas a seção de PEDIDOS de uma {data['tipo_peca']}.
Use itens pontuais (a, b, c). Não inclua introdução.

Teses Principais:
{chr(10).join(f"- {t}" for t in data['teses_principais'])}
"""

    print(f"=== [RAG JURISPRUDENCIA ENCONTRADA] ===\n{jurisprudencias_rag}\n======================================")
    print("Chamando a IA para gerar a fundamentação...")
    fundamentacao = openrouter_client.chat_completion([
        {"role": "user", "content": prompt_fundamentacao}
    ])
    print("Chamando a IA para gerar os pedidos...")
    pedidos = openrouter_client.chat_completion([
        {"role": "user", "content": prompt_pedidos}
    ])
    return fundamentacao, pedidos

def fill_template(data, fundamentacao, pedidos, template_path='templates/modelo_defesa.docx', output_path='Defesa_Gerada.docx'):
    # Abre o template
    doc = Document(template_path)
    
    # Dicionário de substituições
    substitutions = {
        "{{JUIZO}}": data.get("juizo", "").upper(),
        "{{NUMERO_PROCESSO}}": data.get("numero_processo", ""),
        "{{NOME_CLIENTE}}": data.get("nome_cliente", "").upper(),
        "{{TIPO_PECA}}": data.get("tipo_peca", "").upper(),
        "{{RESUMO_FATOS}}": data.get("resumo_fatos", ""),
        "{{FUNDAMENTACAO_JURIDICA}}": fundamentacao.strip(),
        "{{PEDIDOS}}": pedidos.strip()
    }
    
    # Substitui nos parágrafos normais
    for p in doc.paragraphs:
        modificado = False
        for key, value in substitutions.items():
            if key in p.text:
                p.text = p.text.replace(key, value)
                modificado = True
                
        # Ajustes de formatação solicitados
        if p.text.strip():
            texto_upper = p.text.upper()
            if "EXMO" in texto_upper or "EXCELENT" in texto_upper:
                # Na inicial, onde EXMO..., ficar negrito e fonte Arial 14
                for run in p.runs:
                    run.font.bold = True
                    run.font.size = Pt(14)
                    run.font.name = 'Arial'
            elif modificado:
                # Justifique o texto de modo que fique bem ajustado
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                for run in p.runs:
                    run.font.name = 'Arial'
                    run.font.size = Pt(14)
                
    # Salva o novo arquivo
    doc.save(output_path)
    print(f"Documento gerado com sucesso: {output_path}")

def main():
    print("Iniciando Automação Jurídica...")
    
    # 1. Ler dados
    print("Lendo dados do caso...")
    data = load_data()
    
    # 2. Gerar conteúdo com IA
    fundamentacao, pedidos = generate_legal_text(data)
    
    # 3. Preencher template e salvar
    print("Preenchendo documento Word...")
    output_filename = f"{data['tipo_peca']}_{data['nome_cliente'].replace(' ', '_')}.docx"
    fill_template(data, fundamentacao, pedidos, output_path=output_filename)
    
    print("Automação finalizada.")

if __name__ == "__main__":
    main()
