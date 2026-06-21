import csv
import openrouter_client
from banco_dados import get_connection
from dotenv import load_dotenv

load_dotenv()

def gerar_embedding(texto):
    """Transforma um texto em um vetor numérico (Embedding) usando OpenRouter.
    """
    try:
        embedding = openrouter_client.get_embedding(texto)
        return embedding
    except Exception as e:
        print(f"Erro ao gerar embedding via OpenRouter: {e}")
        return None

def carregar_csv_jurisprudencia(caminho_csv):
    """Lê um CSV de ementas e insere no Cofre de Jurisprudência (pgvector)."""
    conn = get_connection()
    if not conn:
        print("Erro ao conectar ao banco.")
        return
        
    sucessos = 0
    erros = 0
    
    print(f"Lendo o arquivo {caminho_csv}...")
    
    try:
        with open(caminho_csv, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            
            for row in reader:
                ementa = row.get('ementa', '').strip()
                tribunal = row.get('tribunal', 'Desconhecido')
                processo = row.get('processo', 'Sem Número')
                materia = row.get('materia', 'Geral').strip()
                
                if not ementa:
                    continue
                    
                print(f"Gerando vetor para o processo {processo} ({materia}) do {tribunal}...")
                vetor = gerar_embedding(ementa)
                
                if vetor:
                    # Inserir no Postgres pgvector
                    # Convertendo a lista do Python para formato array literal do Postgres: '[0.1, 0.2, ...]'
                    vetor_str = f"[{','.join(map(str, vetor))}]"
                    
                    query = """
                    INSERT INTO base_jurisprudencia (ementa, tribunal, processo_referencia, embedding, materia)
                    VALUES (%s, %s, %s, %s, %s)
                    """
                    try:
                        with conn.cursor() as cursor:
                            cursor.execute(query, (ementa, tribunal, processo, vetor_str, materia))
                            conn.commit()
                            sucessos += 1
                    except Exception as e:
                        print(f"Erro no insert do banco: {e}")
                        erros += 1
                else:
                    erros += 1
                    
        print(f"\nFinalizado! {sucessos} ementas vetorizadas com sucesso. {erros} erros.")
        
    except Exception as e:
        print(f"Erro ao abrir arquivo: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    # Exemplo de uso
    print("Para alimentar o cofre, crie um arquivo 'ementas.csv' separado por ';' com as colunas: ementa;tribunal;processo;materia")
    # carregar_csv_jurisprudencia("ementas.csv")
