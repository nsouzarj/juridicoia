import os
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from dotenv import load_dotenv

load_dotenv()

# Pegar as variáveis de ambiente para conexão ao banco de dados (Ex: Supabase)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "senha")
DB_PORT = os.getenv("DB_PORT", "5432")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@escritorio.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

def get_connection():
    """Cria e retorna uma conexão com o banco de dados PostgreSQL."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Erro ao conectar ao banco de dados: {e}")
        return None

def inicializar_banco():
    """Cria a tabela de processos com suporte a JSONB para contextos dinâmicos."""
    conn = get_connection()
    if not conn:
        return
    
    query = """
    CREATE TABLE IF NOT EXISTS processos_lote (
        id SERIAL PRIMARY KEY,
        numero_processo VARCHAR(50) NOT NULL UNIQUE,
        cliente VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDENTE', -- PENDENTE, PROCESSANDO, REVISAO, PROTOCOLADO
        contexto_dinamico JSONB NOT NULL,     -- Aqui entra os fatos, teses e dados específicos do banco
        data_prazo DATE,                      -- Data limite para protocolo
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Ativar extensão de vetores (RAG)
    CREATE EXTENSION IF NOT EXISTS vector;
    
    -- Tabela do "Cofre de Jurisprudência"
    CREATE TABLE IF NOT EXISTS base_jurisprudencia (
        id SERIAL PRIMARY KEY,
        ementa TEXT NOT NULL,
        tribunal VARCHAR(50),
        processo_referencia VARCHAR(100),
        materia VARCHAR(100),
        embedding VECTOR(1536) -- Updated to 1536 dimensions for OpenAI ada-002 embeddings
    );
    -- Ensure embedding column has correct dimensionality even if table existed previously
    ALTER TABLE base_jurisprudencia ALTER COLUMN embedding TYPE VECTOR(1536);
    
    -- Adicionar coluna caso a tabela já exista sem ela
    ALTER TABLE base_jurisprudencia ADD COLUMN IF NOT EXISTS materia VARCHAR(100);
    
    -- Índice para busca rápida por matéria
    CREATE INDEX IF NOT EXISTS idx_jurisprudencia_materia ON base_jurisprudencia(materia);
    CREATE TABLE IF NOT EXISTS materias_juridicas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(150) NOT NULL UNIQUE,
        descricao TEXT,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_materias_nome ON materias_juridicas(nome);

    -- Tabela de Usuários para autenticação segura
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        cargo VARCHAR(50) DEFAULT 'advogado',
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Índice para busca rápida de credenciais de login
    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

    -- Tabela para gerenciamento de pastas de saída externas
    CREATE TABLE IF NOT EXISTS pastas_saida (
        id SERIAL PRIMARY KEY,
        caminho VARCHAR(512) UNIQUE NOT NULL,
        ativo BOOLEAN DEFAULT FALSE,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Atualizações de esquema para suporte a OAB e Revisor
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS oab VARCHAR(50);
    ALTER TABLE processos_lote ADD COLUMN IF NOT EXISTS revisor_id INT REFERENCES usuarios(id);
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            conn.commit()
            
            # Seed do administrador padrão se a tabela de usuários estiver vazia
            try:
                cursor.execute("SELECT COUNT(*) FROM usuarios WHERE cargo = 'admin';")
                count = cursor.fetchone()[0]
                if count == 0:
                    from argon2 import PasswordHasher
                    ph = PasswordHasher()
                    senha_padrao = ADMIN_PASSWORD
                    senha_hash = ph.hash(senha_padrao)
                    cursor.execute(
                        "INSERT INTO usuarios (nome, email, senha_hash, cargo) VALUES (%s, %s, %s, %s);",
                        ("Administrador", ADMIN_EMAIL, senha_hash, "admin")
                    )
                    conn.commit()
                    print(f"Administrador padrão criado: {ADMIN_EMAIL} / {senha_padrao}")
            except Exception as e:
                print(f"Aviso ao criar usuário admin padrão: {e}")
                
            # Seed de matérias jurídicas se a tabela estiver vazia
            try:
                cursor.execute("SELECT COUNT(*) FROM materias_juridicas;")
                count = cursor.fetchone()[0]
                if count == 0:
                    materias_padrao = [
                        ("Direito do Consumidor", "Casos envolvendo relações de consumo, contratos de adesão, cobranças indevidas e indenizações."),
                        ("Direito Bancário", "Casos envolvendo empréstimos, juros, tarifas, PIX, contratos e fraudes bancárias."),
                        ("Direito Civil", "Contratos, responsabilidade civil, propriedade, posse, direito de família e sucessões."),
                        ("Direito do Trabalho", "Relações de emprego, verbas rescisórias, horas extras, dano moral trabalhista e acordos."),
                        ("Direito Tributário", "Execuções fiscais, repetição de indébito, planejamento tributário, taxas e impostos."),
                        ("Direito Administrativo", "Contratos públicos, licitações, servidores públicos, desapropriação e improbidade."),
                        ("Direito Previdenciário", "Benefícios por incapacidade, aposentadorias, pensões e revisões de benefício."),
                        ("Direito Penal", "Casos envolvendo crimes, contravenções penais, dosimetria da pena, causas de extinção da punibilidade e defesas de mérito."),
                        ("Direito Processual Penal", "Nulidades processuais, habeas corpus, recursos, defesas preliminares, relaxamento de prisão e audiência de custódia.")
                    ]
                    cursor.executemany(
                        "INSERT INTO materias_juridicas (nome, descricao) VALUES (%s, %s);",
                        materias_padrao
                    )
                    conn.commit()
                    print("Matérias jurídicas padrão cadastradas!")
            except Exception as e:
                print(f"Aviso ao criar matérias jurídicas padrão: {e}")
                
            print("Banco de dados inicializado com sucesso!")
    except Exception as e:
        print(f"Erro ao criar tabelas: {e}")
    finally:
        conn.close()

def inserir_processo(numero_processo, cliente, contexto_dinamico, data_prazo=None):
    """Insere um novo processo no banco de dados."""
    conn = get_connection()
    if not conn:
        return False
        
    query = """
    INSERT INTO processos_lote (numero_processo, cliente, contexto_dinamico, data_prazo)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (numero_processo) DO NOTHING;
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (numero_processo, cliente, json.dumps(contexto_dinamico), data_prazo))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao inserir processo: {e}")
        return False
    finally:
        conn.close()

def buscar_processos_pendentes():
    """Busca todos os processos pendentes, ordenando pelos que têm prazo mais próximo primeiro."""
    conn = get_connection()
    if not conn:
        return []
        
    # Ordena pelo prazo. NULLS LAST garante que processos sem prazo caiam pro fim da fila
    query = "SELECT * FROM processos_lote WHERE status = 'PENDENTE' ORDER BY data_prazo ASC NULLS LAST;"
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            processos = cursor.fetchall()
            return processos
    except Exception as e:
        print(f"Erro ao buscar processos pendentes: {e}")
        return []
    finally:
        conn.close()

def buscar_todos_processos(revisor_id=None):
    """Busca processos cadastrados, ordenando por prazo e status. Se revisor_id for passado, filtra por ele."""
    conn = get_connection()
    if not conn:
        return []
        
    if revisor_id is not None:
        query = "SELECT p.*, u.nome as revisor_nome, u.oab as revisor_oab FROM processos_lote p LEFT JOIN usuarios u ON p.revisor_id = u.id WHERE p.revisor_id = %s ORDER BY p.data_prazo ASC NULLS LAST, p.id DESC;"
        params = (revisor_id,)
    else:
        query = "SELECT p.*, u.nome as revisor_nome, u.oab as revisor_oab FROM processos_lote p LEFT JOIN usuarios u ON p.revisor_id = u.id ORDER BY p.data_prazo ASC NULLS LAST, p.id DESC;"
        params = ()
        
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params)
            processos = cursor.fetchall()
            return processos
    except Exception as e:
        print(f"Erro ao buscar todos os processos: {e}")
        return []
    finally:
        conn.close()

def atualizar_status(processo_id, novo_status, revisor_id=None):
    """Atualiza o status do processo (Ex: Mudando de PENDENTE para REVISAO) e opcionalmente atribui um revisor."""
    conn = get_connection()
    if not conn:
        return False
        
    try:
        with conn.cursor() as cursor:
            if revisor_id is not None:
                query = """
                UPDATE processos_lote 
                SET status = %s, revisor_id = %s, data_atualizacao = CURRENT_TIMESTAMP
                WHERE id = %s;
                """
                cursor.execute(query, (novo_status, revisor_id, processo_id))
            else:
                query = """
                UPDATE processos_lote 
                SET status = %s, data_atualizacao = CURRENT_TIMESTAMP
                WHERE id = %s;
                """
                cursor.execute(query, (novo_status, processo_id))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao atualizar status: {e}")
        return False
    finally:
        conn.close()

def atualizar_processo(processo_id, cliente, contexto_dinamico, data_prazo, status=None):
    """Atualiza os dados de um processo no banco de dados, incluindo seu contexto dinâmico e opcionalmente o status."""
    conn = get_connection()
    if not conn:
        return False
        
    try:
        with conn.cursor() as cursor:
            if status:
                query = """
                UPDATE processos_lote 
                SET cliente = %s, contexto_dinamico = %s, data_prazo = %s, status = %s, data_atualizacao = CURRENT_TIMESTAMP
                WHERE id = %s;
                """
                cursor.execute(query, (cliente, json.dumps(contexto_dinamico), data_prazo, status, processo_id))
            else:
                query = """
                UPDATE processos_lote 
                SET cliente = %s, contexto_dinamico = %s, data_prazo = %s, data_atualizacao = CURRENT_TIMESTAMP
                WHERE id = %s;
                """
                cursor.execute(query, (cliente, json.dumps(contexto_dinamico), data_prazo, processo_id))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao atualizar processo {processo_id}: {e}")
        return False
    finally:
        conn.close()

def buscar_jurisprudencias():
    """Retorna a lista de jurisprudências armazenadas, ordenada por id."""
    conn = get_connection()
    if not conn:
        return []
    query = """
        SELECT id, ementa, tribunal, processo_referencia, materia
        FROM base_jurisprudencia
        ORDER BY id ASC;
    """
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
            return rows
    except Exception as e:
        print(f"Erro ao buscar jurisprudências: {e}")
        return []
    finally:
        conn.close()

def inserir_pasta(caminho):
    """Insere um novo caminho de pasta no banco de dados."""
    conn = get_connection()
    if not conn:
        return False
    query = """
    INSERT INTO pastas_saida (caminho)
    VALUES (%s)
    ON CONFLICT (caminho) DO NOTHING;
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (caminho,))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao inserir pasta: {e}")
        return False
    finally:
        conn.close()

def buscar_pastas():
    """Busca todas as pastas de saída cadastradas."""
    conn = get_connection()
    if not conn:
        return []
    query = "SELECT id, caminho, ativo, data_criacao FROM pastas_saida ORDER BY data_criacao DESC;"
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            pastas = cursor.fetchall()
            return pastas
    except Exception as e:
        print(f"Erro ao buscar pastas: {e}")
        return []
    finally:
        conn.close()

def ativar_pasta(pasta_id):
    """Ativa uma pasta e desativa todas as outras."""
    conn = get_connection()
    if not conn:
        return False
    query_desativar = "UPDATE pastas_saida SET ativo = FALSE;"
    query_ativar = "UPDATE pastas_saida SET ativo = TRUE WHERE id = %s;"
    try:
        with conn.cursor() as cursor:
            cursor.execute(query_desativar)
            cursor.execute(query_ativar, (pasta_id,))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao ativar pasta: {e}")
        return False
    finally:
        conn.close()

def excluir_pasta(pasta_id):
    """Exclui uma pasta de saída."""
    conn = get_connection()
    if not conn:
        return False
    query = "DELETE FROM pastas_saida WHERE id = %s;"
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (pasta_id,))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao excluir pasta: {e}")
        return False
    finally:
        conn.close()

def buscar_pasta_ativa():
    """Busca o caminho da pasta de saída ativa."""
    conn = get_connection()
    if not conn:
        return None
    query = "SELECT caminho FROM pastas_saida WHERE ativo = TRUE LIMIT 1;"
    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            row = cursor.fetchone()
            return row[0] if row else None
    except Exception as e:
        print(f"Erro ao buscar pasta ativa: {e}")
        return None
    finally:
        conn.close()

def buscar_materias():
    """Busca todas as matérias jurídicas cadastradas."""
    conn = get_connection()
    if not conn:
        return []
    query = "SELECT id, nome, descricao, data_criacao FROM materias_juridicas ORDER BY nome ASC;"
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            return cursor.fetchall()
    except Exception as e:
        print(f"Erro ao buscar materias: {e}")
        return []
    finally:
        conn.close()

def buscar_usuarios():
    """Busca todos os usuários cadastrados."""
    conn = get_connection()
    if not conn:
        return []
    query = "SELECT id, nome, email, cargo, oab, data_criacao FROM usuarios ORDER BY nome ASC;"
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query)
            return cursor.fetchall()
    except Exception as e:
        print(f"Erro ao buscar usuários: {e}")
        return []
    finally:
        conn.close()

def atualizar_usuario(user_id, nome, email, cargo, senha_hash=None, oab=None):
    """Atualiza as informações de um usuário. Se senha_hash for informado, atualiza a senha também."""
    conn = get_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cursor:
            if senha_hash:
                query = """
                    UPDATE usuarios 
                    SET nome = %s, email = %s, cargo = %s, senha_hash = %s, oab = %s, data_atualizacao = CURRENT_TIMESTAMP 
                    WHERE id = %s
                """
                cursor.execute(query, (nome, email, cargo, senha_hash, oab, user_id))
            else:
                query = """
                    UPDATE usuarios 
                    SET nome = %s, email = %s, cargo = %s, oab = %s, data_atualizacao = CURRENT_TIMESTAMP 
                    WHERE id = %s
                """
                cursor.execute(query, (nome, email, cargo, oab, user_id))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        print(f"Erro ao atualizar usuário {user_id}: {e}")
        return False
    finally:
        conn.close()

def excluir_usuario(user_id):
    """Exclui um usuário pelo ID."""
    conn = get_connection()
    if not conn:
        return False
    query = "DELETE FROM usuarios WHERE id = %s;"
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (user_id,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        print(f"Erro ao excluir usuário {user_id}: {e}")
        return False
    finally:
        conn.close()

def buscar_estatisticas_dashboard():
    """Busca dados agregados dos processos para exibir no painel de estatísticas."""
    conn = get_connection()
    if not conn:
        return {
            "total_processos": 0,
            "status_counts": {},
            "materia_counts": {},
            "tipo_peca_counts": {}
        }
    stats = {
        "total_processos": 0,
        "status_counts": {},
        "materia_counts": {},
        "tipo_peca_counts": {}
    }
    try:
        with conn.cursor() as cursor:
            # 1. Total de processos
            cursor.execute("SELECT COUNT(*) FROM processos_lote;")
            stats["total_processos"] = cursor.fetchone()[0]

            # 2. Contagem por status
            cursor.execute("SELECT status, COUNT(*) FROM processos_lote GROUP BY status;")
            for status_val, count in cursor.fetchall():
                stats["status_counts"][status_val] = count

            # 3. Contagem por materia (dentro do contexto_dinamico JSONB)
            cursor.execute("SELECT contexto_dinamico->>'materia', COUNT(*) FROM processos_lote GROUP BY contexto_dinamico->>'materia';")
            for mat_val, count in cursor.fetchall():
                mat_name = mat_val if mat_val else "Geral"
                stats["materia_counts"][mat_name] = count

            # 4. Contagem por tipo_peca (dentro do contexto_dinamico JSONB)
            cursor.execute("SELECT contexto_dinamico->>'tipo_peca', COUNT(*) FROM processos_lote GROUP BY contexto_dinamico->>'tipo_peca';")
            for peca_val, count in cursor.fetchall():
                peca_name = peca_val if peca_val else "Contestação"
                stats["tipo_peca_counts"][peca_name] = count

            return stats
    except Exception as e:
        print(f"Erro ao buscar estatísticas do dashboard: {e}")
        return stats
def salvar_peca_aprovada_no_rag(resumo_fatos, fundamentacao_revisada, materia, tribunal, processo_referencia):
    """Gera o embedding baseado no resumo dos fatos e insere a peça aprovada como jurisprudência no RAG."""
    import openrouter_client
    
    ementa = f"PRECEDENTE INTERNO APROVADO.\nFatos do caso: {resumo_fatos}\nTese acolhida: {fundamentacao_revisada}"
    
    try:
        embedding = openrouter_client.get_embedding(resumo_fatos)
        if not embedding:
            print("Erro ao gerar embedding para a peça aprovada.")
            return False
            
        conn = get_connection()
        if not conn:
            return False
            
        vetor_str = f"[{','.join(map(str, embedding))}]"
        query = """
        INSERT INTO base_jurisprudencia (ementa, tribunal, processo_referencia, embedding, materia)
        VALUES (%s, %s, %s, %s, %s);
        """
        with conn.cursor() as cursor:
            cursor.execute(query, (ementa, tribunal, processo_referencia, vetor_str, materia))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao salvar peça aprovada no RAG: {e}")
        return False
    finally:
        if 'conn' in locals() and conn:
            conn.close()

def excluir_jurisprudencia(jurisprudencia_id):
    """Remove um precedente da base de jurisprudência."""
    conn = get_connection()
    if not conn:
        return False
    query = "DELETE FROM base_jurisprudencia WHERE id = %s;"
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (jurisprudencia_id,))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao excluir jurisprudência: {e}")
        return False
    finally:
        conn.close()

def atualizar_jurisprudencia(jurisprudencia_id, ementa, tribunal, processo_referencia, embedding, materia):
    """Atualiza um precedente na base de jurisprudência, incluindo seu vetor embedding."""
    conn = get_connection()
    if not conn:
        return False
    query = """
    UPDATE base_jurisprudencia
    SET ementa = %s, tribunal = %s, processo_referencia = %s, embedding = %s, materia = %s
    WHERE id = %s;
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, (ementa, tribunal, processo_referencia, embedding, materia, jurisprudencia_id))
            conn.commit()
            return True
    except Exception as e:
        print(f"Erro ao atualizar jurisprudência: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    print("Testando módulo de Banco de Dados...")
    inicializar_banco()
    print("Módulo carregado. Para testar com o Supabase ou Postgres local, configure o .env.")
