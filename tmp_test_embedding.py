import openrouter_client

print('Calling get_embedding...')
try:
    emb = openrouter_client.get_embedding('Exemplo de ementa para teste de embedding.')
    print('Embedding length:', len(emb))
except Exception as e:
    print('Error:', e)
