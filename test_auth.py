import unittest
from datetime import timedelta
from auth_security import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token
)

class TestAuthSecurity(unittest.TestCase):
    def test_password_hashing(self):
        """Valida se o Argon2id gera hashes seguros e verifica senhas com precisão."""
        senha = "minhasenhasegura123"
        hash_senha = get_password_hash(senha)
        
        # O hash gerado deve conter a assinatura do Argon2id
        self.assertTrue(hash_senha.startswith("$argon2id$"))
        
        # Verificação positiva
        self.assertTrue(verify_password(senha, hash_senha))
        
        # Verificação negativa (senha incorreta)
        self.assertFalse(verify_password("senhaerrada", hash_senha))

    def test_jwt_generation_and_decoding(self):
        """Valida a criação e leitura correta do token JWT."""
        payload = {"sub": "advogado@escritorio.com", "cargo": "advogado", "nome": "Dr. Lucas"}
        token = create_access_token(payload, expires_delta=timedelta(minutes=10))
        
        # O token deve ser uma string com as 3 partes do JWT (header.payload.signature)
        self.assertEqual(len(token.split(".")), 3)
        
        # Decodifica e valida o payload
        decoded = decode_access_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["sub"], payload["sub"])
        self.assertEqual(decoded["cargo"], payload["cargo"])
        self.assertEqual(decoded["nome"], payload["nome"])

    def test_jwt_expired_token(self):
        """Valida que tokens expirados são detectados e retornam None."""
        payload = {"sub": "teste@exemplo.com"}
        # Gera um token já expirado com timedelta negativo
        token = create_access_token(payload, expires_delta=timedelta(minutes=-5))
        
        # Decodificação de token expirado deve falhar e retornar None
        decoded = decode_access_token(token)
        self.assertIsNone(decoded)

    def test_jwt_tampered_token(self):
        """Valida que tokens modificados (violados) falham na verificação de assinatura."""
        payload = {"sub": "usuario@exemplo.com"}
        token = create_access_token(payload)
        
        # Adiciona um caractere inválido ao final da assinatura do token
        tampered_token = token + "a"
        
        decoded = decode_access_token(tampered_token)
        self.assertIsNone(decoded)

if __name__ == "__main__":
    unittest.main()
