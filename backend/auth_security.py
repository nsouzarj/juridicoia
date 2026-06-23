import os
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

load_dotenv()

# Configurações de Segurança
SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "ATENÇÃO: A variável de ambiente JWT_SECRET não foi configurada no arquivo .env! "
        "Usando uma chave de fallback insegura apenas para fins de desenvolvimento.",
        RuntimeWarning
    )
    SECRET_KEY = "super-secret-key-change-in-production-12345"

PEPPER = os.getenv("PASSWORD_PEPPER")
if not PEPPER:
    import warnings
    warnings.warn(
        "ATENÇÃO: A variável de ambiente PASSWORD_PEPPER não foi configurada no arquivo .env! "
        "Usando um pepper de fallback inseguro apenas para fins de desenvolvimento.",
        RuntimeWarning
    )
    PEPPER = "super-secret-pepper-change-in-production"

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Instâncias globais de segurança
ph = PasswordHasher()
security = HTTPBearer()

def _get_keyed_password(password: str) -> str:
    """Gera o HMAC-SHA256 da senha usando o Pepper como chave de segurança."""
    return hmac.new(PEPPER.encode(), password.encode(), hashlib.sha256).hexdigest()

def get_password_hash(password: str) -> str:
    """Gera o hash da senha usando o algoritmo seguro Argon2id com Pepper."""
    keyed_password = _get_keyed_password(password)
    return ph.hash(keyed_password)

def verify_password_with_status(plain_password: str, hashed_password: str) -> tuple[bool, bool]:
    """
    Verifica a senha. Retorna uma tupla (is_valid, needs_upgrade).
    needs_upgrade será True se a senha for válida mas estiver no formato antigo (sem Pepper).
    """
    # 1. Tenta validar com Pepper (formato novo)
    try:
        keyed_password = _get_keyed_password(plain_password)
        if ph.verify(hashed_password, keyed_password):
            return True, False
    except VerifyMismatchError:
        pass
    except Exception:
        pass

    # 2. Tenta validar sem Pepper (formato antigo)
    try:
        if ph.verify(hashed_password, plain_password):
            # Válido, mas sem Pepper. Precisa de upgrade!
            return True, True
    except VerifyMismatchError:
        pass
    except Exception:
        pass

    return False, False

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha confere (com compatibilidade para hashes antigos sem Pepper)."""
    is_valid, _ = verify_password_with_status(plain_password, hashed_password)
    return is_valid

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Gera um token JWT assinado com tempo de expiração configurado."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    """Decodifica e valida o token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Injetor de dependência para obter o usuário autenticado atual.
    Lança erro HTTP 401 se o token for inválido.
    """
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    email: str = payload.get("sub")
    cargo: str = payload.get("cargo")
    nome: str = payload.get("nome")
    user_id: int = payload.get("id")
    oab: str = payload.get("oab")
    
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação do usuário ausente no token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return {
        "id": user_id,
        "email": email,
        "cargo": cargo,
        "nome": nome,
        "oab": oab
    }

def get_current_active_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Injetor de dependência para garantir privilégios administrativos.
    Lança erro HTTP 403 se o usuário não for administrador.
    """
    if current_user.get("cargo") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem realizar esta ação."
        )
    return current_user
