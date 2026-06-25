# Usamos a versão 'slim' do Python para uma imagem muito mais leve
FROM python:3.11-slim

WORKDIR /app



COPY requirements.txt .

# Instala as dependências Python sem guardar cache (--no-cache-dir) para manter a imagem limpa
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expor a porta do FastAPI
EXPOSE 8000

# O comando de entrada padrão iniciará o Uvicorn com FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
