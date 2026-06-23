from fastapi.middleware.cors import CORSMiddleware
import os
import io
from typing import List, Optional
from datetime import date
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
from markdown_pdf import MarkdownPdf, Section

import banco_dados as db
from auth_security import (
    get_password_hash,
    verify_password_with_status,
    create_access_token,
    get_current_user,
    get_current_active_admin
)
from gerador_pecas import generate_legal_text, fill_template

load_dotenv()
# Verify OpenRouter API key is present
if not os.getenv("OPENROUTER_API_KEY"):
    raise RuntimeError("OPENROUTER_API_KEY not set; embedding generation will fail.")

app = FastAPI(
    title="Automação Jurídica API",
    description="Backend seguro em Python com suporte a autenticação JWT, Argon2id e RAG de Jurisprudências.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    # Adicionamos o IP da sua VM na lista, permitindo que a interface web acesse a API
    allow_origins=[
        "http://localhost:5173", 
        "http://192.168.1.107:5173",
        "http://localhost:8087",
        "http://192.168.1.107:8087"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware de Segurança para Injeção de Cabeçalhos OWASP
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
        "img-src 'self' data: cdn.jsdelivr.net; "
        "frame-ancestors 'none';"
    )
    return response


# Schemas de Entrada/Saída Pydantic
class UserRegister(BaseModel):
    nome: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    senha: str = Field(..., min_length=6, max_length=100)
    cargo: str = Field("advogado", pattern="^(admin|advogado|revisor)$")
    oab: Optional[str] = None

class UserUpdate(BaseModel):
    nome: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    senha: Optional[str] = Field(None, min_length=6, max_length=100)
    cargo: str = Field("advogado", pattern="^(admin|advogado|revisor)$")
    oab: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    senha: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ProcessoInsert(BaseModel):
    numero_processo: str = Field(..., min_length=5, max_length=50)
    cliente: str = Field(..., min_length=2, max_length=255)
    juizo: str = Field(..., min_length=2, max_length=255)
    tipo_peca: str = Field("Contestação", min_length=2, max_length=100)
    resumo_fatos: str
    teses_principais: List[str]
    materia: str = Field("Geral", min_length=2, max_length=100)
    data_prazo: Optional[date] = None

class ProcessoUpdate(BaseModel):
    cliente: str = Field(..., min_length=2, max_length=255)
    juizo: str = Field(..., min_length=2, max_length=255)
    tipo_peca: str = Field("Contestação", min_length=2, max_length=100)
    resumo_fatos: str
    teses_principais: List[str]
    materia: str = Field("Geral", min_length=2, max_length=100)
    data_prazo: Optional[date] = None
    fundamentacao_revisada: Optional[str] = None
    pedidos_revisados: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(PENDENTE|PROCESSANDO|REVISAO|PROTOCOLADO|ERRO_PROCESSAMENTO)$")

class ProcessoAprovar(BaseModel):
    fundamentacao_revisada: str
    pedidos_revisados: str
    salvar_rag: bool = True

class JurisprudenciaInsert(BaseModel):
    ementa: str = Field(..., min_length=15)
    tribunal: str = Field(..., min_length=2, max_length=50)
    processo: str = Field(..., min_length=5, max_length=100)
    materia: str = Field("Geral", min_length=2, max_length=100)

class PastaInsert(BaseModel):
    caminho: str = Field(..., min_length=1, max_length=512)

class LoteProcessar(BaseModel):
    ids: List[int]
    revisor_id: Optional[int] = None

# Rotas de Autenticação
@app.post("/auth/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserRegister, current_admin: dict = Depends(get_current_active_admin)):
    """
    Registra um novo usuário no banco de dados.
    Apenas usuários com cargo de administrador ('admin') têm acesso.
    """
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao banco de dados."
        )
    
    try:
        with conn.cursor() as cursor:
            # Verifica se o email já existe no banco
            cursor.execute("SELECT id FROM usuarios WHERE email = %s;", (user_data.email,))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este e-mail já está cadastrado."
                )
            
            # Validação do OAB
            if user_data.cargo in ['advogado', 'revisor'] and not user_data.oab:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A OAB é obrigatória para o cargo de advogado ou revisor."
                )

            senha_hash = get_password_hash(user_data.senha)
            cursor.execute(
                "INSERT INTO usuarios (nome, email, senha_hash, cargo, oab) VALUES (%s, %s, %s, %s, %s);",
                (user_data.nome, user_data.email, senha_hash, user_data.cargo, user_data.oab)
            )
            conn.commit()
            return {"message": "Usuário criado com sucesso!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao cadastrar usuário: {e}"
        )
    finally:
        conn.close()

@app.post("/auth/login", response_model=Token)
def login_user(credentials: UserLogin):
    """
    Autentica um usuário por email e senha, retornando o token JWT.
    A comparação de senhas é feita utilizando Argon2id.
    """
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao banco de dados."
        )
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, nome, senha_hash, cargo, oab FROM usuarios WHERE email = %s;", (credentials.email,))
            user = cursor.fetchone()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="E-mail ou senha incorretos.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            user_id, nome, senha_hash, cargo, oab = user
            is_valid, needs_upgrade = verify_password_with_status(credentials.senha, senha_hash)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="E-mail ou senha incorretos.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Se a senha foi validada sem Pepper (formato antigo), atualiza o hash no banco com Pepper
            if needs_upgrade:
                try:
                    novo_senha_hash = get_password_hash(credentials.senha)
                    cursor.execute("UPDATE usuarios SET senha_hash = %s WHERE email = %s;", (novo_senha_hash, credentials.email))
                    conn.commit()
                except Exception as db_err:
                    # Loga o erro mas não impede o login do usuário
                    print(f"Erro ao migrar hash de senha para novo formato: {db_err}")
            
            # Assina token JWT
            access_token = create_access_token(
                data={"sub": credentials.email, "id": user_id, "cargo": cargo, "nome": nome, "oab": oab}
            )
            return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro na autenticação: {e}"
        )
    finally:
        conn.close()

@app.get("/auth/me", response_model=dict)
def get_me(current_user: dict = Depends(get_current_user)):
    """Retorna os detalhes cadastrais do usuário logado atual."""
    return current_user

# Rotas do Negócio (Processos Jurídicos)
@app.get("/processos", response_model=List[dict])
def list_processos(current_user: dict = Depends(get_current_user)):
    """Retorna a lista de processos cadastrados. Filtra pelo revisor se não for admin."""
    if current_user["cargo"] == "admin":
        processos = db.buscar_todos_processos()
    else:
        # Advogados e Revisores vêem apenas seus próprios processos
        processos = db.buscar_todos_processos(revisor_id=current_user["id"])
        
    result = []
    for p in processos:
        result.append({
            "id": p["id"],
            "numero_processo": p["numero_processo"],
            "cliente": p["cliente"],
            "status": p["status"],
            "contexto_dinamico": p["contexto_dinamico"],
            "data_prazo": str(p["data_prazo"]) if p["data_prazo"] else None,
            "data_criacao": p["data_criacao"].isoformat(),
            "revisor_nome": p.get("revisor_nome"),
            "revisor_oab": p.get("revisor_oab")
        })
    return result

@app.post("/processos", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_processo(proc: ProcessoInsert, current_user: dict = Depends(get_current_user)):
    """Insere um novo processo na fila do banco de dados com prazo de urgência e matéria jurídica."""
    contexto = {
        "juizo": proc.juizo,
        "tipo_peca": proc.tipo_peca,
        "resumo_fatos": proc.resumo_fatos,
        "teses_principais": proc.teses_principais,
        "materia": proc.materia
    }
    sucesso = db.inserir_processo(
        numero_processo=proc.numero_processo,
        cliente=proc.cliente,
        contexto_dinamico=contexto,
        data_prazo=proc.data_prazo
    )
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Processo já cadastrado ou erro na gravação."
        )
    return {"message": "Processo inserido na fila com sucesso!"}

def task_processar_peca(processo_id: int, dados: dict, pasta_saida: str):
    """Tarefa assíncrona de geração de petição com RAG e preenchimento de template."""
    try:
        fundamentacao, pedidos = generate_legal_text(dados)
        # Sanitizar tipo_peca e nome_cliente para evitar Directory Traversal
        tipo_peca_limpo = "".join([c for c in dados['tipo_peca'] if c.isalnum() or c in (' ', '_', '-')]).strip()
        tipo_peca_limpo = tipo_peca_limpo.replace(' ', '_')
        
        nome_cliente_limpo = "".join([c for c in dados['nome_cliente'] if c.isalnum() or c in (' ', '_', '-')]).strip()
        nome_cliente_limpo = nome_cliente_limpo.replace(' ', '_')
        
        # Incluir PID para evitar colisão entre processos com mesmo nome de cliente
        pasta_nome = f"{nome_cliente_limpo}__PID-{processo_id}"
        nome_arquivo = f"{tipo_peca_limpo}_{nome_cliente_limpo}__PID-{processo_id}.docx"
        
        # Buscar pasta de saída ativa configurada
        pasta_ativa = db.buscar_pasta_ativa()
        diretorio_base = pasta_ativa if pasta_ativa else pasta_saida
        
        pasta_cliente = os.path.join(diretorio_base, pasta_nome)
        os.makedirs(pasta_cliente, exist_ok=True)
        
        caminho_arquivo = os.path.join(pasta_cliente, nome_arquivo)
        fill_template(dados, fundamentacao, pedidos, output_path=caminho_arquivo)
        
        # Buscar processo para recuperar contexto_dinamico e cliente/prazo
        conn = db.get_connection()
        cliente = dados['nome_cliente']
        data_prazo = None
        contexto_dinamico = {}
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT cliente, data_prazo, contexto_dinamico FROM processos_lote WHERE id = %s;", (processo_id,))
                    row = cursor.fetchone()
                    if row:
                        cliente, data_prazo, contexto_dinamico = row
            except Exception as e:
                print(f"Erro ao obter dados do processo para atualizar contexto: {e}")
            finally:
                conn.close()
                
        # Atualizar contexto_dinamico com as gerações da IA
        contexto_dinamico['fundamentacao_gerada'] = fundamentacao
        contexto_dinamico['pedidos_gerados'] = pedidos
        contexto_dinamico['fundamentacao_revisada'] = fundamentacao
        contexto_dinamico['pedidos_revisados'] = pedidos
        contexto_dinamico['versao'] = contexto_dinamico.get('versao', 0) + 1
        
        # Salvar no banco com o novo status
        db.atualizar_processo(processo_id, cliente, contexto_dinamico, data_prazo, 'REVISAO')
    except Exception as e:
        print(f"Erro na tarefa em segundo plano: {e}")
        db.atualizar_status(processo_id, 'ERRO_PROCESSAMENTO')

@app.post("/processos/{processo_id}/processar", response_model=dict)
def processar_peca(
    processo_id: int, 
    background_tasks: BackgroundTasks, 
    current_user: dict = Depends(get_current_user)
):
    """Dispara a confecção assíncrona da petição para o processo informado."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao conectar ao banco de dados."
        )
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, cliente, numero_processo, status, contexto_dinamico FROM processos_lote WHERE id = %s;", (processo_id,))
            proc = cursor.fetchone()
            if not proc:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            
            p_id, cliente, numero_processo, status_atual, contexto = proc
            if status_atual == 'PROCESSANDO':
                return {"message": "Este caso já está sendo processado."}
            
            db.atualizar_status(p_id, 'PROCESSANDO')
            
            dados = {
                "nome_cliente": cliente,
                "numero_processo": numero_processo,
                "juizo": contexto.get('juizo', 'Juízo Padrão'),
                "tipo_peca": contexto.get('tipo_peca', 'Contestação'),
                "resumo_fatos": contexto.get('resumo_fatos', ''),
                "teses_principais": contexto.get('teses_principais', []),
                "materia": contexto.get('materia', 'Geral')
            }
            
            # Dispara tarefa em background para evitar timeout de HTTP
            background_tasks.add_task(task_processar_peca, p_id, dados, "revisoes_geradas")
            return {"message": "Processamento iniciado em segundo plano."}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno de processamento: {e}"
        )
    finally:
        conn.close()

@app.post("/processos/processar-lote", response_model=dict)
def processar_lote(
    lote: LoteProcessar,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Dispara a confecção assíncrona da petição em lote para os IDs informados."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao conectar ao banco de dados."
        )
    
    try:
        with conn.cursor() as cursor:
            # Buscar todos os processos do lote de uma vez
            cursor.execute(
                "SELECT id, cliente, numero_processo, status, contexto_dinamico FROM processos_lote WHERE id = ANY(%s);",
                (lote.ids,)
            )
            processos = cursor.fetchall()
            
            processados_count = 0
            detalhes = []
            
            for proc in processos:
                p_id, cliente, numero_processo, status_atual, contexto = proc
                # Somente processos com status 'PENDENTE' ou 'ERRO_PROCESSAMENTO' podem ser processados
                if status_atual not in ['PENDENTE', 'ERRO_PROCESSAMENTO']:
                    detalhes.append({"id": p_id, "status": "ignorado", "motivo": f"Status atual é {status_atual}"})
                    continue
                
                db.atualizar_status(p_id, 'PROCESSANDO', revisor_id=lote.revisor_id)
                
                dados = {
                    "nome_cliente": cliente,
                    "numero_processo": numero_processo,
                    "juizo": contexto.get('juizo', 'Juízo Padrão'),
                    "tipo_peca": contexto.get('tipo_peca', 'Contestação'),
                    "resumo_fatos": contexto.get('resumo_fatos', ''),
                    "teses_principais": contexto.get('teses_principais', []),
                    "materia": contexto.get('materia', 'Geral')
                }
                
                # Dispara tarefa em background
                background_tasks.add_task(task_processar_peca, p_id, dados, "revisoes_geradas")
                processados_count += 1
                detalhes.append({"id": p_id, "status": "processando"})
                
            return {
                "message": f"Processamento de {processados_count} processos iniciado em lote.",
                "detalhes": detalhes
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno de processamento em lote: {e}"
        )
    finally:
        conn.close()

@app.get("/processos/estatisticas", response_model=dict)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Retorna dados estatísticos consolidados para exibição no dashboard."""
    stats = db.buscar_estatisticas_dashboard()
    return stats

@app.get("/processos/{processo_id}", response_model=dict)
def get_processo(processo_id: int, current_user: dict = Depends(get_current_user)):
    """Retorna os detalhes de um processo específico."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão ao banco.")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, numero_processo, cliente, status, contexto_dinamico, data_prazo, data_criacao FROM processos_lote WHERE id = %s;", (processo_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            p_id, num, cli, stat, ctx, prazo, criacao = row
            return {
                "id": p_id,
                "numero_processo": num,
                "cliente": cli,
                "status": stat,
                "contexto_dinamico": ctx,
                "data_prazo": str(prazo) if prazo else None,
                "data_criacao": criacao.isoformat()
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar processo: {e}")
    finally:
        conn.close()

@app.put("/processos/{processo_id}", response_model=dict)
def update_processo_dados(processo_id: int, proc_update: ProcessoUpdate, current_user: dict = Depends(get_current_user)):
    """Permite ao advogado salvar alterações ou rascunhos de revisão de um processo."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão ao banco.")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT status, contexto_dinamico FROM processos_lote WHERE id = %s;", (processo_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            status_atual, ctx = row
            
        # Atualizar os dados do contexto
        ctx["juizo"] = proc_update.juizo
        ctx["tipo_peca"] = proc_update.tipo_peca
        ctx["resumo_fatos"] = proc_update.resumo_fatos
        ctx["teses_principais"] = proc_update.teses_principais
        ctx["materia"] = proc_update.materia
        
        if proc_update.fundamentacao_revisada is not None:
            ctx["fundamentacao_revisada"] = proc_update.fundamentacao_revisada
        if proc_update.pedidos_revisados is not None:
            ctx["pedidos_revisados"] = proc_update.pedidos_revisados
            
        # Atualizar no banco
        sucesso = db.atualizar_processo(
            processo_id=processo_id,
            cliente=proc_update.cliente,
            contexto_dinamico=ctx,
            data_prazo=proc_update.data_prazo,
            status=proc_update.status
        )
        if not sucesso:
            raise HTTPException(status_code=400, detail="Erro ao salvar alterações no banco.")
        return {"message": "Alterações salvas com sucesso!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao atualizar: {e}")
    finally:
        conn.close()

@app.post("/processos/{processo_id}/reprocessar", response_model=dict)
def reprocessar_peca(
    processo_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Dispara a regeração assíncrona da peça com os fatos/teses atualizados."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão ao banco.")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT cliente, numero_processo, contexto_dinamico FROM processos_lote WHERE id = %s;", (processo_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            cliente, numero_processo, contexto = row
            
        # Alterar status para PROCESSANDO
        db.atualizar_status(processo_id, 'PROCESSANDO')
        
        dados = {
            "nome_cliente": cliente,
            "numero_processo": numero_processo,
            "juizo": contexto.get('juizo', 'Juízo Padrão'),
            "tipo_peca": contexto.get('tipo_peca', 'Contestação'),
            "resumo_fatos": contexto.get('resumo_fatos', ''),
            "teses_principais": contexto.get('teses_principais', []),
            "materia": contexto.get('materia', 'Geral')
        }
        
        # Dispara tarefa em background para gerar a peça novamente
        background_tasks.add_task(task_processar_peca, processo_id, dados, "revisoes_geradas")
        return {"message": "Regeração com IA iniciada em segundo plano."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao reprocessar: {e}")
    finally:
        conn.close()

@app.post("/processos/{processo_id}/aprovar", response_model=dict)
def aprovar_peca(
    processo_id: int, 
    payload: ProcessoAprovar, 
    current_user: dict = Depends(get_current_user)
):
    """Aprova o rascunho final, gerando a versão Word final e alimentando o RAG se configurado."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Erro de conexão ao banco.")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT numero_processo, cliente, contexto_dinamico, data_prazo FROM processos_lote WHERE id = %s;", (processo_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            numero_processo, cliente, contexto_dinamico, data_prazo = row
            
        # Atualizar o contexto dinâmico com o texto final revisado
        contexto_dinamico["fundamentacao_revisada"] = payload.fundamentacao_revisada
        contexto_dinamico["pedidos_revisados"] = payload.pedidos_revisados
        
        # Gerar o arquivo Word oficial
        dados_docx = {
            "nome_cliente": cliente,
            "numero_processo": numero_processo,
            "juizo": contexto_dinamico.get("juizo", "Juízo Comum"),
            "tipo_peca": contexto_dinamico.get("tipo_peca", "Contestação"),
            "resumo_fatos": contexto_dinamico.get("resumo_fatos", "")
        }
        
        # Sanitizar tipo_peca e nome_cliente para evitar Directory Traversal
        tipo_peca_limpo = "".join([c for c in dados_docx['tipo_peca'] if c.isalnum() or c in (' ', '_', '-')]).strip()
        tipo_peca_limpo = tipo_peca_limpo.replace(' ', '_')
        
        nome_cliente_limpo = "".join([c for c in cliente if c.isalnum() or c in (' ', '_', '-')]).strip()
        nome_cliente_limpo = nome_cliente_limpo.replace(' ', '_')
        
        # Incluir PID para evitar colisão entre processos com mesmo nome de cliente
        pasta_nome = f"{nome_cliente_limpo}__PID-{processo_id}"
        nome_arquivo = f"{tipo_peca_limpo}_{nome_cliente_limpo}__PID-{processo_id}_FINAL.docx"
        
        # Buscar diretório de saída
        pasta_ativa = db.buscar_pasta_ativa()
        diretorio_base = pasta_ativa if pasta_ativa else "revisoes_geradas"
        
        pasta_cliente = os.path.join(diretorio_base, pasta_nome)
        os.makedirs(pasta_cliente, exist_ok=True)
        
        caminho_arquivo = os.path.join(pasta_cliente, nome_arquivo)
        
        # Assinatura do Revisor
        assinatura = f"\n\n---\nRevisado por: {current_user.get('nome', '')} - OAB: {current_user.get('oab', 'Não informada')}"
        pedidos_com_assinatura = payload.pedidos_revisados + assinatura
        
        # Preencher o template usando o texto revisado final
        fill_template(
            data=dados_docx,
            fundamentacao=payload.fundamentacao_revisada,
            pedidos=pedidos_com_assinatura,
            output_path=caminho_arquivo
        )
        
        # Alimentação RAG
        if payload.salvar_rag:
            materia = contexto_dinamico.get("materia", "Geral")
            resumo_fatos = contexto_dinamico.get("resumo_fatos", "")
            
            db.salvar_peca_aprovada_no_rag(
                resumo_fatos=resumo_fatos,
                fundamentacao_revisada=payload.fundamentacao_revisada,
                materia=materia,
                tribunal="Precedente Interno",
                processo_referencia=numero_processo
            )
            
        # Atualizar status para PROTOCOLADO
        contexto_dinamico["caminho_docx_final"] = caminho_arquivo
        db.atualizar_processo(
            processo_id=processo_id,
            cliente=cliente,
            contexto_dinamico=contexto_dinamico,
            data_prazo=data_prazo,
            status='PROTOCOLADO'
        )
        
        return {"message": "Minuta aprovada e gerada com sucesso! RAG atualizado."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao aprovar minuta: {e}")
    finally:
        conn.close()

@app.get("/processos/{processo_id}/pdf")
def download_processo_pdf(
    processo_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Gera dinamicamente e retorna a petição em PDF."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao conectar ao banco de dados."
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, numero_processo, cliente, status, contexto_dinamico FROM processos_lote WHERE id = %s;",
                (processo_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            
            p_id, num_processo, cliente, status_atual, contexto = row
            
            fundamentacao = contexto.get("fundamentacao_revisada") or contexto.get("fundamentacao_gerada") or ""
            pedidos = contexto.get("pedidos_revisados") or contexto.get("pedidos_gerados") or ""
            juizo = contexto.get("juizo") or "Juízo não informado"
            tipo_peca = contexto.get("tipo_peca") or "Petição"
            resumo_fatos = contexto.get("resumo_fatos") or ""
            
            # Remove as tags de GitHub Alerts para evitar problemas de compatibilidade
            fundamentacao_limpa = fundamentacao.replace("> [!IMPORTANT]", "").replace("> [!WARNING]", "").replace("> [!NOTE]", "")
            pedidos_limpos = pedidos.replace("> [!IMPORTANT]", "").replace("> [!WARNING]", "").replace("> [!NOTE]", "")
            
            assinatura = f"\n\n---\n**Revisado por:** {current_user.get('nome', '')} - OAB: {current_user.get('oab', 'Não informada')}"

            # O uso de tags HTML inline permite justificar o texto no PDF final
            md_content = f"""<div style="text-align: justify;">

# EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA COMARCA DE {juizo.upper()}

**Processo nº:** {num_processo}  
**Requerente/Requerido:** {cliente.upper()}  

## {tipo_peca.upper()}

### I. DOS FATOS
{resumo_fatos}

### II. DA FUNDAMENTAÇÃO JURÍDICA
{fundamentacao_limpa}

### III. DOS PEDIDOS
{pedidos_limpos}
{assinatura}

</div>
"""
            
            # Gera o PDF usando MarkdownPdf
            pdf = MarkdownPdf(toc_level=2)
            pdf.add_section(Section(md_content))
            
            buf = io.BytesIO()
            pdf.save_bytes(buf)
            buf.seek(0)
            
            cliente_limpo = "".join([c for c in cliente if c.isalnum() or c in (' ', '_', '-')]).strip()
            cliente_limpo = cliente_limpo.replace(' ', '_')
            filename = f"Peca_{cliente_limpo}_{p_id}.pdf"
            
            headers = {
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
            return StreamingResponse(buf, media_type="application/pdf", headers=headers)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar PDF: {e}"
        )
    finally:
        conn.close()

@app.get("/processos/{processo_id}/docx")
def download_processo_docx(
    processo_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Retorna o arquivo Word (.docx) oficial da petição."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao conectar ao banco de dados."
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, numero_processo, cliente, status, contexto_dinamico FROM processos_lote WHERE id = %s;",
                (processo_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            
            p_id, num_processo, cliente, status_atual, contexto = row
            caminho_docx = contexto.get("caminho_docx_final")
            
            # Fallback caso não esteja gravado no banco de dados
            if not caminho_docx:
                tipo_peca = contexto.get("tipo_peca", "Contestação")
                tipo_peca_limpo = "".join([c for c in tipo_peca if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_')
                nome_cliente_limpo = "".join([c for c in cliente if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_')
                pasta_nome = f"{nome_cliente_limpo}__PID-{p_id}"
                nome_arquivo = f"{tipo_peca_limpo}_{nome_cliente_limpo}__PID-{p_id}_FINAL.docx"
                
                pasta_ativa = db.buscar_pasta_ativa()
                diretorio_base = pasta_ativa if pasta_ativa else "revisoes_geradas"
                caminho_docx = os.path.join(diretorio_base, pasta_nome, nome_arquivo)
            
            if not os.path.exists(caminho_docx):
                raise HTTPException(
                    status_code=404, 
                    detail=f"Arquivo Word não encontrado fisicamente no servidor no caminho: {caminho_docx}"
                )
            
            filename = os.path.basename(caminho_docx)
            
            headers = {
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
            
            return FileResponse(
                caminho_docx,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers=headers
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao recuperar arquivo Word: {e}"
        )
    finally:
        conn.close()

@app.post("/processos/{processo_id}/regerar-docx")
def regerar_docx_processo(
    processo_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Regera a petição Word no diretório ativo atual e atualiza a rota no banco."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao conectar ao banco de dados."
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, numero_processo, cliente, status, contexto_dinamico, data_prazo FROM processos_lote WHERE id = %s;",
                (processo_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Processo não encontrado.")
            
            p_id, num_processo, cliente, status_atual, contexto, data_prazo = row
            
            if status_atual not in ['PROTOCOLADO', 'REVISAO']:
                raise HTTPException(
                    status_code=400,
                    detail="Apenas processos com status REVISAO ou PROTOCOLADO possuem conteúdo gerado para regeração."
                )
            
            fundamentacao = contexto.get("fundamentacao_revisada") or contexto.get("fundamentacao_gerada") or ""
            pedidos = contexto.get("pedidos_revisados") or contexto.get("pedidos_gerados") or ""
            juizo = contexto.get("juizo") or "Juízo Comum"
            tipo_peca = contexto.get("tipo_peca") or "Contestação"
            resumo_fatos = contexto.get("resumo_fatos") or ""
            
            dados_docx = {
                "nome_cliente": cliente,
                "numero_processo": num_processo,
                "juizo": juizo,
                "tipo_peca": tipo_peca,
                "resumo_fatos": resumo_fatos
            }
            
            tipo_peca_limpo = "".join([c for c in tipo_peca if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_')
            nome_cliente_limpo = "".join([c for c in cliente if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_')
            # Incluir PID para evitar colisão entre processos com mesmo nome de cliente
            pasta_nome = f"{nome_cliente_limpo}__PID-{p_id}"
            nome_arquivo = f"{tipo_peca_limpo}_{nome_cliente_limpo}__PID-{p_id}_FINAL.docx"
            
            pasta_ativa = db.buscar_pasta_ativa()
            diretorio_base = pasta_ativa if pasta_ativa else "revisoes_geradas"
            
            pasta_cliente = os.path.join(diretorio_base, pasta_nome)
            os.makedirs(pasta_cliente, exist_ok=True)
            
            caminho_arquivo = os.path.join(pasta_cliente, nome_arquivo)
            
            fill_template(
                data=dados_docx,
                fundamentacao=fundamentacao,
                pedidos=pedidos,
                output_path=caminho_arquivo
            )
            
            contexto["caminho_docx_final"] = caminho_arquivo
            
            db.atualizar_processo(
                processo_id=p_id,
                cliente=cliente,
                contexto_dinamico=contexto,
                data_prazo=row[5],
                status=status_atual
            )
            
            return {
                "message": "Petição Word regerada com sucesso no diretório configurado!",
                "caminho": caminho_arquivo
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao regerar arquivo Word: {e}"
        )
    finally:
        conn.close()

# Rotas de gerenciamento de pastas (Apenas Admin)
@app.get("/admin/pastas", response_model=List[dict])
def list_pastas(current_admin: dict = Depends(get_current_active_admin)):
    """Retorna todas as pastas de saída cadastradas."""
    pastas = db.buscar_pastas()
    result = []
    for p in pastas:
        result.append({
            "id": p["id"],
            "caminho": p["caminho"],
            "ativo": p["ativo"],
            "data_criacao": p["data_criacao"].isoformat()
        })
    return result

@app.post("/admin/pastas", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_pasta(pasta: PastaInsert, current_admin: dict = Depends(get_current_active_admin)):
    """
    Cadastra uma nova pasta de saída externa.
    Valida se o caminho existe e é gravável.
    """
    caminho = pasta.caminho.strip()
    
    # Validar se o caminho é absoluto e válido
    if not os.path.isabs(caminho):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O caminho da pasta deve ser um caminho absoluto válido."
        )
    
    # Tentar criar a pasta se ela não existir
    try:
        os.makedirs(caminho, exist_ok=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não foi possível criar o diretório especificado: {e}"
        )
        
    # Validar permissão de escrita criando e deletando um arquivo de teste
    test_file_path = os.path.join(caminho, ".write_test_tmp")
    try:
        with open(test_file_path, "w") as f:
            f.write("test")
        os.remove(test_file_path)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O servidor não tem permissão de escrita nesta pasta externa."
        )
        
    # Inserir no banco de dados
    sucesso = db.inserir_pasta(caminho)
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pasta já cadastrada ou erro ao salvar no banco de dados."
        )
    return {"message": "Pasta cadastrada com sucesso!"}

@app.post("/admin/pastas/{pasta_id}/ativar", response_model=dict)
def set_pasta_ativa(pasta_id: int, current_admin: dict = Depends(get_current_active_admin)):
    """Define a pasta ativa no sistema."""
    sucesso = db.ativar_pasta(pasta_id)
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao ativar a pasta."
        )
    return {"message": "Pasta ativada com sucesso!"}

@app.delete("/admin/pastas/{pasta_id}", response_model=dict)
def delete_pasta(pasta_id: int, current_admin: dict = Depends(get_current_active_admin)):
    """Remove uma pasta cadastrada."""
    sucesso = db.excluir_pasta(pasta_id)
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao excluir a pasta."
        )
    return {"message": "Pasta removida com sucesso!"}

@app.get("/admin/usuarios", response_model=List[dict])
def list_usuarios(current_admin: dict = Depends(get_current_active_admin)):
    """Retorna a lista de todos os usuários cadastrados."""
    usuarios = db.buscar_usuarios()
    result = []
    for u in usuarios:
        result.append({
            "id": u["id"],
            "nome": u["nome"],
            "email": u["email"],
            "cargo": u["cargo"],
            "oab": u.get("oab"),
            "data_criacao": u["data_criacao"].isoformat()
        })
    return result

@app.put("/admin/usuarios/{user_id}", response_model=dict)
def update_usuario(user_id: int, user_data: UserUpdate, current_admin: dict = Depends(get_current_active_admin)):
    """Atualiza as informações de um usuário. Apenas administradores."""
    # Valida se o email já existe para outro usuário
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao banco de dados."
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM usuarios WHERE email = %s AND id != %s;", (user_data.email, user_id))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este e-mail já está em uso por outro usuário."
                )
            
            # Impedir demissão de si mesmo (mudar o próprio cargo de admin para advogado/revisor)
            cursor.execute("SELECT email, cargo FROM usuarios WHERE id = %s;", (user_id,))
            target = cursor.fetchone()
            if not target:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Usuário não encontrado."
                )
            target_email = target[0]
            if target_email == current_admin["email"] and user_data.cargo != "admin":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Você não pode alterar o seu próprio perfil de administrador."
                )
    finally:
        conn.close()

    # Validação do OAB
    if user_data.cargo in ['advogado', 'revisor'] and not user_data.oab:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A OAB é obrigatória para o cargo de advogado ou revisor."
        )

    # Prepara senha_hash se fornecido
    senha_hash = get_password_hash(user_data.senha) if user_data.senha else None
    
    sucesso = db.atualizar_usuario(user_id, user_data.nome, user_data.email, user_data.cargo, senha_hash, user_data.oab)
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao atualizar o usuário."
        )
    return {"message": "Usuário atualizado com sucesso!"}

@app.delete("/admin/usuarios/{user_id}", response_model=dict)
def delete_usuario(user_id: int, current_admin: dict = Depends(get_current_active_admin)):
    """Exclui um usuário pelo ID. Apenas administradores."""
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao banco de dados."
        )
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT email FROM usuarios WHERE id = %s;", (user_id,))
            target = cursor.fetchone()
            if not target:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Usuário não encontrado."
                )
            target_email = target[0]
            # Impedir que o admin se exclua
            if target_email == current_admin["email"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Você não pode excluir o seu próprio usuário."
                )
    finally:
        conn.close()

    sucesso = db.excluir_usuario(user_id)
    if not sucesso:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao excluir o usuário."
        )
    return {"message": "Usuário excluído com sucesso!"}

@app.post("/jurisprudencia", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_jurisprudencia(jur: JurisprudenciaInsert, current_user: dict = Depends(get_current_user)):
    """
    Cadastra um novo precedente no cofre de jurisprudências.
    Gera o embedding vetorial correspondente via Gemini API e salva no pgvector.
    """
    from alimentar_jurisprudencia import gerar_embedding
    
    conn = db.get_connection()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível conectar ao banco de dados."
        )
        
    try:
        vetor = gerar_embedding(jur.ementa)
        if not vetor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao gerar o embedding vetorial da ementa."
            )
            
        vetor_str = f"[{','.join(map(str, vetor))}]"
        query = """
        INSERT INTO base_jurisprudencia (ementa, tribunal, processo_referencia, embedding, materia)
        VALUES (%s, %s, %s, %s, %s);
        """
        with conn.cursor() as cursor:
            cursor.execute(query, (jur.ementa, jur.tribunal, jur.processo, vetor_str, jur.materia))
            conn.commit()
            return {"message": "Precedente cadastrado e vetorizado com sucesso!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao inserir jurisprudência: {e}"
        )
    finally:
        conn.close()

@app.get("/jurisprudencia/list", response_model=List[dict])
def list_jurisprudencias(current_user: dict = Depends(get_current_user)):
    """Retorna a lista de jurisprudências armazenadas."""
    jurisprudencias = db.buscar_jurisprudencias()
    return jurisprudencias

@app.put("/jurisprudencia/{jurisprudencia_id}", response_model=dict)
def update_jurisprudencia(
    jurisprudencia_id: int,
    jur: JurisprudenciaInsert,
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um precedente na base de jurisprudência, recalculando o embedding vetorial da ementa."""
    from alimentar_jurisprudencia import gerar_embedding
    
    vetor = gerar_embedding(jur.ementa)
    if not vetor:
        raise HTTPException(status_code=400, detail="Erro ao gerar o embedding vetorial da ementa.")
        
    vetor_str = f"[{','.join(map(str, vetor))}]"
    
    sucesso = db.atualizar_jurisprudencia(
        jurisprudencia_id=jurisprudencia_id,
        ementa=jur.ementa,
        tribunal=jur.tribunal,
        processo_referencia=jur.processo,
        embedding=vetor_str,
        materia=jur.materia
    )
    if not sucesso:
        raise HTTPException(status_code=400, detail="Erro ao atualizar precedente no banco de dados.")
    return {"message": "Precedente atualizado com sucesso!"}

@app.delete("/jurisprudencia/{jurisprudencia_id}", response_model=dict)
def delete_jurisprudencia(jurisprudencia_id: int, current_user: dict = Depends(get_current_user)):
    """Remove um precedente da base de jurisprudência."""
    sucesso = db.excluir_jurisprudencia(jurisprudencia_id)
    if not sucesso:
        raise HTTPException(status_code=400, detail="Erro ao excluir precedente.")
    return {"message": "Precedente excluído com sucesso!"}


@app.get("/materias", response_model=List[dict])
def list_materias(current_user: dict = Depends(get_current_user)):
    """Retorna todas as matérias jurídicas cadastradas."""
    materias = db.buscar_materias()
    result = []
    for m in materias:
        result.append({
            "id": m["id"],
            "nome": m["nome"],
            "descricao": m["descricao"],
            "data_criacao": m["data_criacao"].isoformat()
        })
    return result

if __name__ == "__main__":
    import uvicorn
    # Executa a inicialização do banco antes de expor a API
    db.inicializar_banco()
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
