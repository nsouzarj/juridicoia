import sys
import os
# Ensure project root is in PYTHONPATH
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if project_root not in sys.path:
    sys.path.append(project_root)

import pytest  # noqa: E402
import httpx  # noqa: E402

from alimentar_jurisprudencia import gerar_embedding  # noqa: E402

# Mock OpenRouter base URL
BASE_URL = "https://openrouter.ai/api/v1"

@pytest.fixture
def mock_success(respx_mock):
    # Mock successful embedding response with 1536-dimensional vector
    embedding = [float(i) for i in range(1536)]
    respx_mock.post(f"{BASE_URL}/embeddings").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"embedding": embedding}]},
        )
    )

@pytest.fixture
def mock_failure(respx_mock):
    # Mock failure response (e.g., 400 Bad Request)
    respx_mock.post(f"{BASE_URL}/embeddings").mock(
        return_value=httpx.Response(
            400,
            json={"error": {"message": "Invalid request", "code": 400}},
        )
    )

def test_gerar_embedding_success(mock_success):
    text = "Exemplo de ementa para teste"
    vetor = gerar_embedding(text)
    assert vetor is not None, "Embedding should not be None on success"
    assert isinstance(vetor, list), "Embedding should be a list"
    assert len(vetor) == 1536, "Embedding length must be 1536"
    # Verify that the values match the mocked data (first few entries)
    assert vetor[:5] == [0.0, 1.0, 2.0, 3.0, 4.0]

def test_gerar_embedding_failure(mock_failure, capsys):
    text = "Texto que causará erro"
    vetor = gerar_embedding(text)
    # On error, the function returns None and prints an error message
    assert vetor is None
    captured = capsys.readouterr()
    assert "Erro ao gerar embedding via OpenRouter" in captured.out
