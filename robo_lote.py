import csv
import os
import time
from gerador_pecas import generate_legal_text, fill_template

def processar_lote(arquivo_csv="processos.csv", pasta_saida="saida_lote"):
    # Cria a pasta de saída se não existir
    os.makedirs(pasta_saida, exist_ok=True)
    
    print(f"Iniciando Robô de Lote. Lendo arquivo: {arquivo_csv}")
    
    sucessos = 0
    erros = 0
    
    try:
        with open(arquivo_csv, mode='r', encoding='utf-8') as file:
            # Lendo arquivo separado por ponto e vírgula
            leitor = csv.DictReader(file, delimiter=';')
            
            for linha in leitor:
                nome = linha.get('nome_cliente', 'Desconhecido')
                print(f"\n--- Processando caso: {nome} ---")
                
                try:
                    # Preparar os dados no formato esperado pela IA
                    teses = linha.get('teses_principais', '').split(';')
                    teses = [t.strip() for t in teses if t.strip()]
                    
                    dados = {
                        "nome_cliente": nome,
                        "numero_processo": linha.get('numero_processo', ''),
                        "juizo": linha.get('juizo', ''),
                        "tipo_peca": linha.get('tipo_peca', 'Petição'),
                        "resumo_fatos": linha.get('resumo_fatos', ''),
                        "teses_principais": teses,
                        "materia": linha.get('materia', 'Geral').strip()
                    }
                    
                    # 1. Gerar texto com a IA
                    fundamentacao, pedidos = generate_legal_text(dados)
                    
                    # 2. Preencher e salvar arquivo Word
                    nome_arquivo = f"{dados['tipo_peca']}_{nome.replace(' ', '_')}.docx"
                    caminho_arquivo = os.path.join(pasta_saida, nome_arquivo)
                    
                    fill_template(dados, fundamentacao, pedidos, output_path=caminho_arquivo)
                    sucessos += 1
                    
                    # Pausa rápida para não sobrecarregar a API caso sejam muitos casos reais
                    time.sleep(1)
                    
                except Exception as e:
                    print(f"Erro ao processar o caso {nome}: {e}")
                    erros += 1
                    
    except FileNotFoundError:
        print(f"ERRO: Arquivo {arquivo_csv} não encontrado. Crie o arquivo com os dados.")
        
    print(f"\nResumo do Lote: {sucessos} gerados com sucesso, {erros} erros.")
    print(f"Os documentos estão na pasta: {pasta_saida}/")

if __name__ == "__main__":
    processar_lote()
