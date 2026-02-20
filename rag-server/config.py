import os
from dotenv import load_dotenv

load_dotenv()

# ─── Provider Registry (mirrors src/lib/ai/providers.ts) ────────

PROVIDER_DEFAULTS = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "default_model": "claude-sonnet-4-5-20250929",
        "env_key": "ANTHROPIC_API_KEY",
    },
    "google": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "gemini-2.5-pro",
        "env_key": "GOOGLE_AI_API_KEY",
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "default_model": "mistral-large-latest",
        "env_key": "MISTRAL_API_KEY",
    },
    "xai": {
        "base_url": "https://api.x.ai/v1",
        "default_model": "grok-3",
        "env_key": "XAI_API_KEY",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "env_key": "DEEPSEEK_API_KEY",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "openai/gpt-4o",
        "env_key": "OPENROUTER_API_KEY",
    },
    "perplexity": {
        "base_url": "https://api.perplexity.ai",
        "default_model": "sonar-pro",
        "env_key": "PERPLEXITY_API_KEY",
    },
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "default_model": "llama3.1",
        "env_key": "",
    },
    "lmstudio": {
        "base_url": "http://localhost:1234/v1",
        "default_model": "local-model",
        "env_key": "",
    },
    "minimax": {
        "base_url": "https://api.minimax.chat/v1",
        "default_model": "MiniMax-M2.1",
        "env_key": "MINIMAX_API_KEY",
    },
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-plus",
        "env_key": "GLM_API_KEY",
    },
    "huggingface": {
        "base_url": "https://api-inference.huggingface.co/v1",
        "default_model": "meta-llama/Llama-3.1-70B-Instruct",
        "env_key": "HUGGINGFACE_API_KEY",
    },
    "vercel": {
        "base_url": "https://gateway.ai.vercel.app/v1",
        "default_model": "openai/gpt-4o",
        "env_key": "VERCEL_AI_GATEWAY_KEY",
    },
}


def _parse_model_string(model_str: str) -> tuple[str, str]:
    """Parse 'provider/model' into (provider, model). Same logic as providers.ts."""
    slash = model_str.find("/")
    if slash > 0:
        provider = model_str[:slash]
        model = model_str[slash + 1:]
        if provider in PROVIDER_DEFAULTS:
            return provider, model
    return "openai", model_str


def _resolve_provider():
    """Resolve LLM provider, model, API key, and base URL from env vars."""
    ai_provider = os.getenv("AI_PROVIDER", "openai")
    ai_model = os.getenv("AI_MODEL", "")

    # AI_MODEL can be "provider/model" format, which overrides AI_PROVIDER
    if ai_model and "/" in ai_model:
        provider, model = _parse_model_string(ai_model)
    else:
        provider = ai_provider
        defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
        model = ai_model or defaults["default_model"]

    defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])

    # API key: check provider-specific env var
    env_key = defaults["env_key"]
    api_key = os.getenv(env_key, "") if env_key else ""

    # Base URL: allow explicit override, otherwise use provider default
    base_url = os.getenv("OPENAI_BASE_URL", "") or defaults["base_url"]

    return provider, model, api_key, base_url


# ─── Resolved AI Configuration ──────────────────────────────────

AI_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL = _resolve_provider()

# Embedding Configuration
# Embedding always uses an OpenAI-compatible endpoint. For providers without
# their own embedding API, configure EMBEDDING_BASE_URL to point at an
# OpenAI-compatible embedding service (defaults to the LLM provider's URL).
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "") or LLM_API_KEY
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "") or LLM_BASE_URL

# Server Configuration
HOST = os.getenv("RAG_HOST", "0.0.0.0")
PORT = int(os.getenv("RAG_PORT", "8020"))
API_KEY = os.getenv("RAG_API_KEY", "")

# Storage
WORKING_DIR = os.getenv("RAG_WORKING_DIR", "./rag_storage")
