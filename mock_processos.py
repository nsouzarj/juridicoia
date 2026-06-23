import csv
import random
from datetime import datetime, timedelta

def generate_mock_processos(filename="processos.csv", count=200):
    materias = ["Direito Civil", "Direito do Consumidor", "Direito Trabalhista", "Direito Previdenciário"]
    pecas = ["Contestação", "Recurso de Apelação", "Petição Inicial", "Embargos de Declaração"]
    juizos = ["1ª Vara Cível", "2ª Vara do Trabalho", "Juizado Especial Cível", "3ª Vara da Família", "4ª Vara Cível", "1ª Vara de Fazenda Pública"]
    
    nomes = ["Ana", "Pedro", "João", "Lucas", "Gabriel", "Maria", "Júlia", "Camila", "Carlos", "Marcos", 
             "Felipe", "Fernanda", "Mariana", "Juliana", "Rafael", "Rodrigo", "Paulo", "Beatriz", "Clara", "Gustavo",
             "Roberto", "Ricardo", "Aline", "Patrícia", "Thiago", "Bruno", "Eduardo", "Letícia", "Amanda", "Marcelo"]
    sobrenomes = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", 
                  "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Gomes",
                  "Mendes", "Nunes", "Moraes", "Melo", "Barros", "Freitas", "Barbosa", "Pinto", "Moura", "Cavalcanti"]

    with open(filename, mode='w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter=';', quotechar='"', quoting=csv.QUOTE_MINIMAL)
        # Cabeçalho
        writer.writerow(["numero_processo", "nome_cliente", "juizo", "tipo_peca", "resumo_fatos", "teses_principais", "materia", "data_prazo"])
        
        base_date = datetime.now()
        
        for i in range(1, count + 1):
            num = f"{random.randint(1000000, 9999999)}-{random.randint(10, 99)}.{datetime.now().year}.8.26.0000"
            
            nome_completo = f"{random.choice(nomes)} {random.choice(sobrenomes)} {random.choice(sobrenomes)}"
            
            juizo = random.choice(juizos)
            peca = random.choice(pecas)
            fatos = f"O cliente {nome_completo} alega danos materiais e morais devido a um atraso na entrega de um produto adquirido no comércio local. As provas estão anexas aos autos principais."
            teses = "Ausência de dano moral configurado|Ilegitimidade passiva|Decadência do direito"
            materia = random.choice(materias)
            
            # Prazo entre hoje e +45 dias
            prazo = (base_date + timedelta(days=random.randint(0, 45))).strftime("%Y-%m-%d")
            
            writer.writerow([num, nome_completo, juizo, peca, fatos, teses, materia, prazo])
            
    print(f"{count} processos mockados gerados com nomes realistas em {filename}!")

if __name__ == "__main__":
    generate_mock_processos()
