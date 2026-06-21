import requests
import os

BASE_URL = os.getenv('BASE_URL', 'http://127.0.0.1:8000')

def login(email, password):
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "senha": password})
    print('Login response:', resp.status_code, resp.text)
    if resp.status_code == 200:
        return resp.json()['access_token']
    return None

def create_jurisprudencia(token, payload):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}/jurisprudencia", json=payload, headers=headers)
    print('Create response:', resp.status_code, resp.text)

if __name__ == '__main__':
    email = os.getenv('ADMIN_EMAIL') or 'admin@escritorio.com'
    password = os.getenv('ADMIN_PASSWORD') or 'admin123'
    token = login(email, password)
    if token:
        payload = {
            "ementa": "Exemplo de ementa para teste de embedding via API.",
            "tribunal": "TJSP",
            "processo": "2023/0001",
            "materia": "Civil"
        }
        create_jurisprudencia(token, payload)
