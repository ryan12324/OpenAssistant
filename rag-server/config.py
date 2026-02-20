import os
import httpx
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


def _resolve_from_env():
    """Resolve AI config from environment variables only."""
    ai_provider = os.getenv("AI_PROVIDER", "openai")
    ai_model = os.getenv("AI_MODEL", "")

    if ai_model and "/" in ai_model:
        provider, model = _parse_model_string(ai_model)
    else:
        provider = ai_provider
        defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
        model = ai_model or defaults["default_model"]

    defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
    env_key = defaults["env_key"]
    api_key = os.getenv(env_key, "") if env_key else ""
    base_url = os.getenv("OPENAI_BASE_URL", "") or defaults["base_url"]

    embedding_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    embedding_api_key = os.getenv("EMBEDDING_API_KEY", "") or api_key
    embedding_base_url = os.getenv("EMBEDDING_BASE_URL", "") or base_url

    return provider, model, api_key, base_url, embedding_model, embedding_api_key, embedding_base_url


def _fetch_from_web_app():
    """
    Fetch effective AI config from the Next.js web app's /api/settings/effective.
    Returns None if the web app is unreachable.
    """
    web_url = os.getenv("WEB_APP_URL", "http://web:3000")
    rag_key = os.getenv("RAG_API_KEY", "")
    try:
        headers = {}
        if rag_key:
            headers["Authorization"] = f"Bearer {rag_key}"
        resp = httpx.get(f"{web_url}/api/settings/effective", headers=headers, timeout=5)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"INFO: Could not fetch config from web app ({e}), using env vars")
    return None


def _resolve_config():
    """
    Resolve AI config: try web app DB settings first, fall back to env vars.
    """
    remote = _fetch_from_web_app()
    if remote:
        provider = remote.get("provider", "openai")
        model = remote.get("model", "")
        api_key = remote.get("apiKey", "")
        base_url = remote.get("baseUrl", "")

        if not model:
            defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
            model = defaults["default_model"]
        if not base_url:
            defaults = PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["openai"])
            base_url = defaults["base_url"]

        embedding_model = remote.get("embeddingModel", "text-embedding-3-small")
        embedding_api_key = remote.get("embeddingApiKey", "") or api_key
        embedding_base_url = remote.get("embeddingBaseUrl", "") or base_url

        return provider, model, api_key, base_url, embedding_model, embedding_api_key, embedding_base_url

    return _resolve_from_env()


# ─── Resolved AI Configuration ──────────────────────────────────

(
    AI_PROVIDER,
    LLM_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    EMBEDDING_MODEL,
    EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL,
) = _resolve_config()

EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))

# Server Configuration
HOST = os.getenv("RAG_HOST", "0.0.0.0")
PORT = int(os.getenv("RAG_PORT", "8020"))
API_KEY = os.getenv("RAG_API_KEY", "")

# Storage
WORKING_DIR = os.getenv("RAG_WORKING_DIR", "./rag_storage")
