# Fluxos e Diagramas UML — Praxis Automação Jurídica

Este documento serve como referência técnica completa para o funcionamento, arquitetura e fluxos de dados do sistema **Praxis**.

---

## 🏛️ 1. Arquitetura Geral do Ecossistema

O ecossistema é composto por interfaces web (React e Angular), uma API FastAPI, um banco de dados relacional/vetorial PostgreSQL e workers assíncronos. Ambos os frontends se comunicam com o mesmo backend em Python.

```mermaid
graph TD
    subgraph FRONTEND_REACT ["🖥️  FRONTEND REACT — React / Vite (localhost:5173)"]
        UI_Login["🔐 Tela de Login\nJWT / Argon2id"]
        UI_Dash["📊 Painel de Estatísticas\nGráficos SVG em tempo real"]
        UI_Fila["⚖️  Fila de Casos\nOrdenada por Prazo"]
        UI_RAG["📚 Cofre RAG\nPrecedentes Vetorizados"]
        UI_Admin["⚙️  Admin\nGestão de Operadores"]
    end

    subgraph FRONTEND_ANGULAR ["🖥️  FRONTEND ANGULAR — Angular v20 (localhost:4200)"]
        UI_Login_A["🔐 Tela de Login\nJWT / Signals"]
        UI_Dash_A["📊 Painel de Estatísticas\nGráficos SVG em tempo real"]
        UI_Fila_A["⚖️  Fila de Casos\nOrdenada por Prazo"]
        UI_RAG_A["📚 Cofre RAG\nPrecedentes Vetorizados"]
        UI_Admin_A["⚙️  Admin\nGestão de Operadores"]
    end

    subgraph BACKEND ["⚡ BACKEND — FastAPI / Python (localhost:8087 / 8000)"]
        AUTH["🔑 Auth Module\nJWT + Argon2id"]
        API_PROC["📋 /processos\nCRUD + Fila"]
        API_JUR["📖 /jurisprudencia\nRAG Embeddings"]
        API_ADMIN["🛡️  /admin\nUsuários + Pastas"]
        WORKER["🔄 BackgroundTask\ntask_processar_peca"]
    end

    subgraph DATABASE ["🗄️  PostgreSQL + pgvector"]
        DB_PROC[("processos_lote\nJSONB + Prazo")]
        DB_JUR[("base_jurisprudencia\nvector 1536 dims")]
        DB_USR[("usuarios\nArgon2id hash")]
        DB_PASTA[("pastas_saida\nCaminho de saída")]
    end

    subgraph EXTERNAL ["☁️  APIs Externas"]
        LLM["🤖 OpenRouter\ngpt-4o / LLM"]
        EMB["🔢 OpenRouter\ntext-embedding-ada-002"]
    end

    UI_Login -->|"POST /auth/login"| AUTH
    UI_Dash -->|"GET /processos/estatisticas"| API_PROC
    UI_Fila -->|"GET/POST /processos"| API_PROC
    UI_RAG -->|"GET/POST /jurisprudencia"| API_JUR
    UI_Admin -->|"CRUD /admin"| API_ADMIN

    UI_Login_A -->|"POST /auth/login"| AUTH
    UI_Dash_A -->|"GET /processos/estatisticas"| API_PROC
    UI_Fila_A -->|"GET/POST /processos"| API_PROC
    UI_RAG_A -->|"GET/POST /jurisprudencia"| API_JUR
    UI_Admin_A -->|"CRUD /admin"| API_ADMIN

    AUTH --> DB_USR
    API_PROC --> DB_PROC
    API_PROC -->|"Dispara"| WORKER
    API_JUR --> DB_JUR
    API_ADMIN --> DB_USR
    API_ADMIN --> DB_PASTA

    WORKER -->|"Busca semântica pgvector"| DB_JUR
    WORKER -->|"Atualiza status"| DB_PROC
    WORKER -->|"Gera texto jurídico"| LLM
    API_JUR -->|"Gera embeddings"| EMB

    WORKER -->|"Salva .docx"| SAIDA["📁 Pasta de Saída\n.docx por cliente"]
```

---

<div style="page-break-before: always;"></div>

## 🗂️ 2. Fluxo A: Gestão e Alimentação de Jurisprudência (RAG)

A base de dados de precedentes jurídicos é alimentada de forma isolada, permitindo inclusões e atualizações constantes sem pausar a geração de peças.

```mermaid
flowchart TD
    %% Entradas
    subgraph INPUT ["📥 ENTRADAS DE DADOS"]
        direction TB
        CSV["📄 Arquivo CSV\nementas.csv"]
        FORM["🖥️ Formulário\nWeb Manual"]
        CSVIN["📊 Importação\nCSV via UI"]
    end

    %% Processamento
    subgraph FEED ["⚙️ PROCESSAMENTO (alimentar_jurisprudencia.py)"]
        direction TB
        PARSE["🔍 Leitura e\nValidação\ndo Registro"]
        EMBED["🔢 Geração de\nEmbedding\n(ada-002)"]
        INSERT["💾 INSERT INTO\nbase_jurisprudencia\n(ementa, vetor)"]
        
        PARSE --> EMBED
        EMBED --> INSERT
    end

    CSV --> PARSE
    FORM --> PARSE
    CSVIN --> PARSE

    %% Armazenamento
    subgraph STORE ["🗄️ ARMAZENAMENTO"]
        VEC[("PostgreSQL\npgvector\nINDEX por matéria")]
    end
    
    INSERT -->|"Vetor 1536d"| VEC

    %% Uso
    subgraph USE ["🔍 USO NO SISTEMA"]
        direction TB
        QUERY["Busca Vetorial\n(Similaridade)\nLIMIT 3"]
        RAG["📎 Injeção\nno Prompt\n(RAG)"]
        
        QUERY --> RAG
    end
    
    VEC --> QUERY

    %% Estilos de alto contraste
    style INPUT fill:#f0f4ff,stroke:#5dade2,stroke-width:2px,color:#333
    style FEED fill:#fff8e8,stroke:#f1c40f,stroke-width:2px,color:#333
    style STORE fill:#f0fff4,stroke:#27ae60,stroke-width:2px,color:#333
    style USE fill:#fef9f0,stroke:#e67e22,stroke-width:2px,color:#333
    style CSV fill:#fff,stroke:#5dade2,stroke-width:2px
    style FORM fill:#fff,stroke:#5dade2,stroke-width:2px
    style CSVIN fill:#fff,stroke:#5dade2,stroke-width:2px
    style PARSE fill:#fff,stroke:#f1c40f,stroke-width:2px
    style EMBED fill:#fff,stroke:#f1c40f,stroke-width:2px
    style INSERT fill:#fff,stroke:#f1c40f,stroke-width:2px
    style VEC fill:#fff,stroke:#27ae60,stroke-width:2px
    style QUERY fill:#fff,stroke:#e67e22,stroke-width:2px
    style RAG fill:#fff,stroke:#e67e22,stroke-width:2px
```

### Funcionamento:
- **Entrada:** CSV contendo `ementa;tribunal;processo;materia`.
- **Segmentação:** A coluna `materia` categoriza o precedente (ex: "Direito Bancário", "Trabalhista") para que a busca vetorial futura filtre apenas julgados pertinentes ao caso.
- **Inserção:** O script de alimentação gera o vetor de 1536 dimensões e insere tudo no banco PostgreSQL (`base_jurisprudencia`).

---

## ⏳ 3. Fluxo B: Fila de Geração Priorizada por Prazos

O processamento das peças respeita os prazos fatais (`data_prazo`). A fila consome os registros priorizando os prazos mais urgentes e próximos.

```mermaid
sequenceDiagram
    autonumber
    participant BD as PostgreSQL (processos_lote)
    participant Worker as task_processar_peca
    participant RAG as base_jurisprudencia (pgvector)
    participant IA as OpenRouter API (LLM)
    participant DOCX as Templates Word

    Worker->>BD: Consulta pendentes ordenados: ORDER BY data_prazo ASC NULLS LAST
    BD-->>Worker: Retorna lista de processos (Mais urgentes primeiro)
    
    loop Para cada processo
        Worker->>BD: Atualiza status para 'PROCESSANDO'
        Worker->>RAG: Busca semântica vetorial restrita à matéria (LIMIT 3)
        RAG-->>Worker: Retorna as 3 jurisprudências mais relevantes daquela matéria
        
        Worker->>IA: Envia prompt com Fatos, Teses e Jurisprudências RAG
        IA-->>Worker: Retorna Fundamentação e Pedidos formatados
        
        Worker->>DOCX: Substitui tags {{...}} no modelo_defesa.docx
        DOCX-->>Worker: Salva arquivo final (.docx) na pasta de saída
        
        Worker->>BD: Atualiza status para 'REVISAO'
    end
```

### Regra de Ordenação SQL:
```sql
SELECT * 
FROM processos_lote 
WHERE status = 'PENDENTE' 
ORDER BY data_prazo ASC NULLS LAST;
```
- **`data_prazo ASC`**: Prioriza datas mais antigas/próximas de vencer.
- **`NULLS LAST`**: Joga processos sem data cadastrada para o fim da fila.

---

## 🔁 4. Fluxo C: Ciclo de Revisão e Aprovação de Peças (Human-in-the-Loop)

Para garantir a qualidade técnica das peças geradas antes do protocolo judicial, as minutas passam por uma etapa de revisão pelo advogado. Caso a peça necessite de correções, ela retorna para a fila de processamento até ser aprovada.

```mermaid
flowchart TD
    Inicio([🟢 INÍCIO\nProcesso Cadastrado]) --> P1

    P1["📋 Status: PENDENTE\nAguardando na fila\npriorizada por prazo"]

    P1 -->|"Worker detecta\nprocesso pendente"| P2

    P2["⚙️ Status: PROCESSANDO\nRAG busca jurisprudências\nIA gera a minuta"]

    P2 -->|"Erro na API ou timeout"| PERRO

    PERRO["❌ Status: ERRO_PROCESSAMENTO\nFalha registrada no banco\nAdvogado pode revisar causa"]

    PERRO -->|"Operador\nreprocessa manualmente"| P2

    P2 -->|"Minuta .docx\ngerada com sucesso"| P3

    P3["📝 Status: REVISAO\nMinuta disponível\npara análise do advogado"]

    P3 --> LeituraPeca

    LeituraPeca["🔍 Advogado abre o arquivo\n.docx gerado pela IA\nno Word ou sistema"]

    LeituraPeca --> Decisao

    Decisao{{"📌 A peça está\ncorreta e completa?"}}

    Decisao -->|"✅ SIM\nAprovar"| Aprovada

    Decisao -->|"❌ NÃO\nRejeitar e ajustar"| Ajuste

    Ajuste["✏️ Advogado atualiza:\n• resumo_fatos\n• teses_principais\n• Outras informações\nno sistema"]

    Ajuste -->|"Sistema retorna\nstatus → PENDENTE"| P1

    Aprovada["✔️ Peça Aprovada\nDocumento validado\npelo advogado"]

    Aprovada --> Protocolo

    Protocolo["🏛️ Status: PROTOCOLADO\nPeça enviada ao PJe\nou sistema do tribunal"]

    Protocolo --> Fim([🏁 CONCLUÍDO\nProcesso encerrado])

    %% Estilos
    style Inicio fill:#2ecc71,color:#fff,stroke:#27ae60
    style Fim fill:#2ecc71,color:#fff,stroke:#27ae60
    style P1 fill:#e67e22,color:#fff,stroke:#d35400
    style P2 fill:#3498db,color:#fff,stroke:#2980b9
    style PERRO fill:#e74c3c,color:#fff,stroke:#c0392b
    style P3 fill:#9b59b6,color:#fff,stroke:#8e44ad
    style LeituraPeca fill:#f8f9fa,color:#333,stroke:#aaa
    style Decisao fill:#f39c12,color:#fff,stroke:#e67e22
    style Ajuste fill:#e8d5b7,color:#333,stroke:#c9a84c
    style Aprovada fill:#d5f5e3,color:#333,stroke:#27ae60
    style Protocolo fill:#1a1a2e,color:#c9a84c,stroke:#c9a84c
```

### Regras do Ciclo de Correção e Versionamento:
1. **Edição Direta vs. Reprocessamento:** 
   - Se os ajustes forem de **formatação ou pequenas correções**, o advogado edita o arquivo `.docx` diretamente no Word, salva e marca como "Aprovado" no sistema. O sistema utilizará este arquivo editado para o protocolo.
   - Se a peça estiver **incompleta ou com teses erradas**, o advogado altera as instruções (ex: altera `resumo_fatos`, adiciona `teses_principais` ou preenche um campo de "Feedback para a IA") na interface do sistema e clica em **Reprovar/Reprocessar**.
2. **Reinserção Automática:** Ao clicar em reprovar, o status do processo no banco de dados retorna para `'PENDENTE'`. O documento `.docx` anterior é descartado ou arquivado como versão antiga (ex: `minuta_v1.docx`).
3. **Nova Geração (Re-processamento):** O Worker detecta o status `'PENDENTE'`, lê o contexto atualizado (agora contendo o feedback do advogado) e gera uma **nova minuta do zero** (`minuta_v2.docx`), re-alimentando o status para `'REVISAO'`. Isso garante que a IA corrija os fundamentos jurídicos de forma estrutural sem que o advogado precise reescrever o texto manualmente.
---

## 📊 5. Diagrama de Atividade — Geração de Minuta Jurídica

Descreve o fluxo de atividades passo a passo desde a requisição até a entrega do documento.

```mermaid
flowchart TD
    %% Início
    Start([🟢 INÍCIO\nOperador Solicita\nProcessamento]) --> Valida

    %% Validação
    Valida[POST /processar\nSistema valida dados\ne enfileira a tarefa] --> RAG

    %% Fase 1
    RAG{{"🔍 FASE 1: RAG\nBusca no pgvector as 3\njurisprudências mais\nrelevantes ao caso"}} --> LLM

    %% Fase 2
    LLM{{"🤖 FASE 2: IA\nMonta o contexto e\ngera Fundamentação\ne Pedidos via LLM"}} --> VerificaIA{IA Retornou\nSucesso?}

    VerificaIA -->|Sim| DOCX
    VerificaIA -->|Erro/Timeout| Falha([🛑 FALHA\nRegistra Erro no BD])

    %% Fase 3
    DOCX{{"📄 FASE 3: DOCX\nSubstitui as tags no\nmodelo_defesa.docx\ncom a resposta da IA"}} --> Fim

    %% Fim
    Fim([🏁 FIM\nMinuta pronta para\nrevisão do Advogado])

    %% Estilos de alto contraste e tamanho
    style Start fill:#2ecc71,color:#fff,stroke:#27ae60,stroke-width:3px
    style Valida fill:#f39c12,color:#fff,stroke:#e67e22,stroke-width:2px
    style RAG fill:#3498db,color:#fff,stroke:#2980b9,stroke-width:3px
    style LLM fill:#9b59b6,color:#fff,stroke:#8e44ad,stroke-width:3px
    style VerificaIA fill:#f1c40f,color:#333,stroke:#f39c12,stroke-width:2px
    style DOCX fill:#e67e22,color:#fff,stroke:#d35400,stroke-width:3px
    style Fim fill:#2ecc71,color:#fff,stroke:#27ae60,stroke-width:3px
    style Falha fill:#e74c3c,color:#fff,stroke:#c0392b,stroke-width:3px
```

---

## 👥 6. Diagrama de Caso de Uso — Atores e Funcionalidades

Mapeia o que cada perfil de usuário pode fazer no sistema.

```mermaid
graph LR
    subgraph Atores
        Adv[🧑‍⚖️ Advogado]
        Rev[🔍 Revisor]
        Adm[🛡️ Administrador]
    end

    subgraph Sistema Praxis
        subgraph Autenticação
            UC1(Login com JWT)
            UC2(Ver perfil)
        end

        subgraph Fila de Peças
            UC3(Listar processos atribuídos)
            UC4(Cadastrar processo)
            UC5(Processar caso individualmente)
            UC6(Processar em lote e atribuir Revisor)
            UC7(Importar processos via CSV)
        end

        subgraph Cofre RAG
            UC8(Listar jurisprudências)
            UC9(Cadastrar precedente)
            UC10(Importar jurisprudências via CSV)
            UC11(Ver matérias jurídicas)
        end

        subgraph Painel
            UC12(Ver estatísticas\ne gráficos)
        end

        subgraph Admin
            UC13(Cadastrar operador)
            UC14(Editar operador)
            UC15(Excluir operador)
            UC16(Gerenciar pastas\nde saída)
        end
    end

    Adv --> UC1
    Adv --> UC2
    Adv --> UC3
    Adv --> UC4
    Adv --> UC5
    Adv --> UC6
    Adv --> UC7
    Adv --> UC8
    Adv --> UC9
    Adv --> UC10
    Adv --> UC11
    Adv --> UC12

    Rev --> UC1
    Rev --> UC2
    Rev --> UC3
    Rev --> UC8
    Rev --> UC12

    Adm --> UC1
    Adm --> UC2
    Adm --> UC3
    Adm --> UC4
    Adm --> UC5
    Adm --> UC6
    Adm --> UC7
    Adm --> UC8
    Adm --> UC9
    Adm --> UC10
    Adm --> UC11
    Adm --> UC12
    Adm --> UC13
    Adm --> UC14
    Adm --> UC15
    Adm --> UC16
```

---

## 🔄 7. Diagrama de Sequência — Autenticação e Acesso à API

Fluxo detalhado de login e uso seguro dos endpoints com JWT.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário (Browser)
    participant FE as React Frontend
    participant API as FastAPI /auth
    participant DB as PostgreSQL (usuarios)

    U->>FE: Preenche email e senha
    FE->>API: POST /auth/login {email, senha}
    API->>DB: SELECT nome, senha_hash, cargo\nWHERE email = ?
    DB-->>API: Retorna registro do usuário
    API->>API: verify_password(senha, senha_hash)\nArgon2id
    
    alt Credenciais inválidas
        API-->>FE: HTTP 401 Unauthorized
        FE-->>U: Exibe mensagem de erro
    else Credenciais válidas
        API->>API: create_access_token(sub, cargo, nome)\nJWT HS256 — expira em 8h
        API-->>FE: {access_token, token_type}
        FE->>FE: Salva token no\nlocalStorage
        FE-->>U: Redireciona para o Dashboard
    end

    Note over U,DB: Requisições subsequentes

    U->>FE: Acessa aba Fila de Peças
    FE->>API: GET /processos\nAuthorization: Bearer <token>
    API->>API: get_current_user(token)\nDecodifica e valida JWT
    
    alt Token expirado ou inválido
        API-->>FE: HTTP 401 Unauthorized
        FE-->>U: Faz logout automático
    else Token válido
        API->>DB: SELECT * FROM processos_lote\nORDER BY data_prazo ASC NULLS LAST
        DB-->>API: Lista de processos
        API-->>FE: JSON com lista de processos
        FE-->>U: Renderiza tabela da fila
    end
```

---

## 🗄️ 8. Diagrama de Classes — Modelo de Dados e Módulos

Representa as entidades do banco de dados, os schemas Pydantic da API e as relações entre os módulos Python.

```mermaid
classDiagram
    class processos_lote {
        +int id PK
        +str numero_processo UNIQUE
        +str cliente
        +str status
        +jsonb contexto_dinamico
        +date data_prazo
        +int revisor_id FK
        +timestamp data_criacao
        +timestamp data_atualizacao
    }

    class base_jurisprudencia {
        +int id PK
        +text ementa
        +str tribunal
        +str processo_referencia
        +str materia
        +vector embedding
    }

    class usuarios {
        +int id PK
        +str nome
        +str email UNIQUE
        +str senha_hash
        +str cargo
        +str oab
        +timestamp data_criacao
        +timestamp data_atualizacao
    }

    class materias_juridicas {
        +int id PK
        +str nome UNIQUE
        +text descricao
        +timestamp data_criacao
    }

    class pastas_saida {
        +int id PK
        +str caminho UNIQUE
        +bool ativo
        +timestamp data_criacao
    }

    class ProcessoInsert {
        <<Pydantic Schema>>
        +str numero_processo
        +str cliente
        +str juizo
        +str tipo_peca
        +str resumo_fatos
        +list teses_principais
        +str materia
        +date data_prazo
    }

    class JurisprudenciaInsert {
        <<Pydantic Schema>>
        +str ementa
        +str tribunal
        +str processo
        +str materia
    }

    class UserRegister {
        <<Pydantic Schema>>
        +str nome
        +str email
        +str senha
        +str cargo
    }

    class banco_dados {
        <<Module>>
        +get_connection()
        +inicializar_banco()
        +inserir_processo()
        +buscar_todos_processos()
        +buscar_processos_pendentes()
        +atualizar_status()
        +buscar_jurisprudencias()
        +inserir_pasta()
        +buscar_pastas()
        +ativar_pasta()
        +excluir_pasta()
        +buscar_pasta_ativa()
        +buscar_materias()
        +buscar_usuarios()
        +atualizar_usuario()
        +excluir_usuario()
        +buscar_estatisticas_dashboard()
    }

    class gerador_pecas {
        <<Module>>
        +generate_legal_text(dados) tuple
        +fill_template(dados, fund, pedidos, path)
    }

    class auth_security {
        <<Module>>
        +get_password_hash(senha) str
        +verify_password(plain, hashed) bool
        +create_access_token(data) str
        +get_current_user(token) dict
        +get_current_active_admin(token) dict
    }

    class alimentar_jurisprudencia {
        <<Module>>
        +gerar_embedding(texto) list
    }

    class main {
        <<FastAPI App>>
        +POST /auth/login
        +POST /auth/register
        +GET /auth/me
        +GET /processos
        +POST /processos
        +POST /processos/processar-lote
        +POST /processos/:id/processar
        +GET /processos/estatisticas
        +GET /jurisprudencia/list
        +POST /jurisprudencia
        +GET /materias
        +GET /admin/usuarios
        +PUT /admin/usuarios/:id
        +DELETE /admin/usuarios/:id
        +GET /admin/pastas
        +POST /admin/pastas
        +POST /admin/pastas/:id/ativar
        +DELETE /admin/pastas/:id
    }

    %% Relações de Banco
    processos_lote "0..*" --> "1" materias_juridicas : materia (via JSONB)
    base_jurisprudencia "0..*" --> "1" materias_juridicas : materia

    %% Relações de Módulo
    main --> banco_dados : usa
    main --> auth_security : usa
    main --> gerador_pecas : usa
    main --> alimentar_jurisprudencia : usa (inline)
    gerador_pecas --> banco_dados : busca RAG
    banco_dados --> processos_lote : CRUD
    banco_dados --> base_jurisprudencia : CRUD
    banco_dados --> usuarios : CRUD
    banco_dados --> materias_juridicas : READ
    banco_dados --> pastas_saida : CRUD

    %% Schemas → Módulos
    ProcessoInsert ..> main : POST /processos
    JurisprudenciaInsert ..> main : POST /jurisprudencia
    UserRegister ..> main : POST /auth/register
```

---

## 📋 Resumo dos Status do Processo

| Status | Descrição | Transição |
|---|---|---|
| `PENDENTE` | Aguardando processamento na fila | → `PROCESSANDO` |
| `PROCESSANDO` | Worker gerando a minuta com IA+RAG | → `REVISAO` ou `ERRO_PROCESSAMENTO` |
| `REVISAO` | Minuta gerada, aguardando aprovação do advogado | → `PROTOCOLADO` ou volta para `PENDENTE` |
| `PROTOCOLADO` | Peça aprovada e enviada ao PJe | — (estado final) |
| `ERRO_PROCESSAMENTO` | Falha na geração (timeout, erro de API, etc.) | → `PENDENTE` (reprocessar) |
