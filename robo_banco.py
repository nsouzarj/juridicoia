import os
import time
from gerador_pecas import generate_legal_text, fill_template
from banco_dados import buscar_processos_pendentes, atualizar_status

def processar_fila_banco(pasta_saida="saida_lote_banco"):
    os.makedirs(pasta_saida, exist_ok=True)
    
    print("Conectando ao banco de dados e buscando processos PENDENTES...")
    processos = buscar_processos_pendentes()
    
    if not processos:
        print("Nenhum processo pendente na fila.")
        return
        
    print(f"Foram encontrados {len(processos)} processos na fila.")
    
    sucessos = 0
    erros = 0
    
    for proc in processos:
        id_proc = proc['id']
        nome = proc['cliente']
        print(f"\n--- Processando caso DB: {nome} ---")
        
        # Muda status para PROCESSANDO
        atualizar_status(id_proc, 'PROCESSANDO')
        
        try:
            # O contexto dinâmico no banco já é um JSON/Dicionário
            contexto = proc['contexto_dinamico']
            
            # Garante que as chaves obrigatórias existam no contexto
            dados = {
                "nome_cliente": nome,
                "numero_processo": proc['numero_processo'],
                "juizo": contexto.get('juizo', 'Juízo Padrão'),
                "tipo_peca": contexto.get('tipo_peca', 'Contestação'),
                "resumo_fatos": contexto.get('resumo_fatos', ''),
                "teses_principais": contexto.get('teses_principais', []),
                "materia": contexto.get('materia', 'Geral')
            }
            
            fundamentacao, pedidos = generate_legal_text(dados)
            
            nome_arquivo = f"{dados['tipo_peca']}_{nome.replace(' ', '_')}.docx"
            caminho_arquivo = os.path.join(pasta_saida, nome_arquivo)
            
            fill_template(dados, fundamentacao, pedidos, output_path=caminho_arquivo)
            
            # Se deu certo, atualiza o banco
            atualizar_status(id_proc, 'REVISAO')
            sucessos += 1
            
            time.sleep(1)
            
        except Exception as e:
            print(f"Erro ao processar o caso {nome}: {e}")
            atualizar_status(id_proc, 'ERRO_PROCESSAMENTO')
            erros += 1
            
    print(f"\nResumo da Fila: {sucessos} gerados, {erros} erros.")

if __name__ == "__main__":
    processar_fila_banco()
