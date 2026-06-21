FROM python:3.11-slim

WORKDIR /app

# Instalar dependências do sistema necessárias para compilar algumas libs
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expor a porta do Streamlit
EXPOSE 8501

# O comando de entrada padrão iniciará a interface web
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
