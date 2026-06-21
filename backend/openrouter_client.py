import os
import httpx
from typing import List, Dict, Any

# Load environment variables (expects .env in project root)
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")
if not API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY not set in environment")

BASE_URL = "https://openrouter.ai/api/v1"

_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/your-repo/skill_juridica",
    "X-Title": "Craia Legal Automation",
}

def _post(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Internal helper to POST JSON payload to OpenRouter and return the parsed JSON.
    Raises a RuntimeError on non‑200 responses.
    """
    url = f"{BASE_URL}{endpoint}"
    response = httpx.post(url, headers=_HEADERS, json=payload, timeout=30.0)
    if response.status_code != 200:
        raise RuntimeError(f"OpenRouter request failed {response.status_code}: {response.text}")
    return response.json()

def get_embedding(text: str, model: str = "openai/text-embedding-ada-002") -> List[float]:
    """Generate a vector embedding for *text* using OpenRouter.

    Args:
        text: The input string to embed.
        model: The OpenRouter model identifier for embeddings. Defaults to a performant
            text‑embedding model.
    Returns:
        A list of floats representing the embedding.
    """
    payload = {
        "model": model,
        "input": text,
    }
    data = _post("/embeddings", payload)
    # The response structure follows OpenAI compatible format
    return data.get("data", [{}])[0].get("embedding", [])

def chat_completion(messages: List[Dict[str, str]], model: str = "meta-llama/llama-3.1-70b-instruct") -> str:
    """Run a chat completion using OpenRouter.

    Args:
        messages: List of messages as ``[{"role": "user", "content": "..."}, ...]``.
        model: Identifier of the model to use. Defaults to a high‑performance instruction model.
    Returns:
        The assistant's reply content as a string.
    """
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 2048,
    }
    data = _post("/chat/completions", payload)
    # OpenAI‑compatible response
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("No choices returned from OpenRouter chat completion")
    return choices[0].get("message", {}).get("content", "")
