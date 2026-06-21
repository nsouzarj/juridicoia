import sys
import os
from unittest.mock import patch, MagicMock

# Ensure project root and backend are in PYTHONPATH
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
backend_path = os.path.join(project_root, "backend")
if project_root not in sys.path:
    sys.path.append(project_root)
if backend_path not in sys.path:
    sys.path.append(backend_path)

import pytest
from fastapi.testclient import TestClient

# Mock the OpenRouter API Key check during import
with patch.dict(os.environ, {"OPENROUTER_API_KEY": "fake_key_for_testing"}):
    from main import app
    from auth_security import get_current_user

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {"email": "advogado@escritorio.com", "cargo": "advogado", "nome": "Lucas"}
    yield
    app.dependency_overrides.clear()

@pytest.fixture
def mock_db():
    with patch("main.db") as mock:
        yield mock

def test_get_processo_not_found(mock_db):
    # Setup mock to return no rows
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = None
    mock_db.get_connection.return_value = mock_conn

    response = client.get("/processos/999", headers={"Authorization": "Bearer fake_token"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Processo não encontrado."

def test_get_processo_success(mock_db):
    # Setup mock row
    import datetime
    mock_row = (
        1,
        "12345-67.2026.8.26.0100",
        "João Silva",
        "REVISAO",
        {"juizo": "1a Vara Cível", "tipo_peca": "Contestação", "resumo_fatos": "Fatos mock"},
        datetime.date(2026, 6, 25),
        datetime.datetime(2026, 6, 21, 10, 0, 0)
    )
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = mock_row
    mock_db.get_connection.return_value = mock_conn

    response = client.get("/processos/1", headers={"Authorization": "Bearer fake_token"})
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["numero_processo"] == "12345-67.2026.8.26.0100"
    assert data["cliente"] == "João Silva"
    assert data["status"] == "REVISAO"
    assert data["contexto_dinamico"]["juizo"] == "1a Vara Cível"

def test_update_processo_success(mock_db):
    # Mock fetching the current process
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ("REVISAO", {"juizo": "Antigo"})
    mock_db.get_connection.return_value = mock_conn
    mock_db.atualizar_processo.return_value = True

    payload = {
        "cliente": "João Silva Alterado",
        "juizo": "Novo Juizo",
        "tipo_peca": "Contestação",
        "resumo_fatos": "Novos fatos descritos",
        "teses_principais": ["Tese A", "Tese B"],
        "materia": "Civil",
        "data_prazo": "2026-06-25",
        "fundamentacao_revisada": "Nova fundamentação",
        "pedidos_revisados": "Novos pedidos"
    }

    response = client.put("/processos/1", json=payload, headers={"Authorization": "Bearer fake_token"})
    assert response.status_code == 200
    assert response.json()["message"] == "Alterações salvas com sucesso!"
    mock_db.atualizar_processo.assert_called_once()

def test_aprovar_peca_success(mock_db):
    import datetime
    # Mock row fetch
    mock_row = (
        "12345-67.2026.8.26.0100",
        "João Silva",
        {"juizo": "1a Vara Cível", "tipo_peca": "Contestação", "resumo_fatos": "Fatos mock", "materia": "Civil"},
        datetime.date(2026, 6, 25)
    )
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = mock_row
    mock_db.get_connection.return_value = mock_conn
    mock_db.buscar_pasta_ativa.return_value = "saida_teste"
    mock_db.salvar_peca_aprovada_no_rag.return_value = True
    mock_db.atualizar_processo.return_value = True

    # Patch fill_template to avoid writing physical files during test
    with patch("main.fill_template") as mock_fill_template:
        payload = {
            "fundamentacao_revisada": "Texto revisado da fundamentação",
            "pedidos_revisados": "Texto revisado dos pedidos",
            "salvar_rag": True
        }
        response = client.post("/processos/1/aprovar", json=payload, headers={"Authorization": "Bearer fake_token"})
        assert response.status_code == 200
        assert "Minuta aprovada e gerada com sucesso!" in response.json()["message"]
        mock_fill_template.assert_called_once()
        mock_db.salvar_peca_aprovada_no_rag.assert_called_once()
        mock_db.atualizar_processo.assert_called_once()
