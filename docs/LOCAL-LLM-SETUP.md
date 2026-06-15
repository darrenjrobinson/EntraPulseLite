# Setting Up Ollama with CodeLlama 13B in Docker

## Overview
This guide walks through setting up a local LLM (CodeLlama 13B) using Ollama in a Docker container, making it available via API for application integration.

## Prerequisites
- Docker installed
- ~8GB available RAM
- PowerShell (Windows) or terminal access

## Step 1: Run Ollama Container

```powershell
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama --restart unless-stopped ollama/ollama
```

This command:
- Runs Ollama in the background (`-d`)
- Names the container "ollama" (`--name ollama`)
- Exposes API on port 11434 (`-p 11434:11434`)
- Creates persistent storage for models (`-v ollama:/root/.ollama`)
- Auto-restarts container if Docker restarts (`--restart unless-stopped`)

## Step 2: Verify Container is Running

```powershell
docker ps
```

You should see the ollama container listed and running.

## Step 3: Pull CodeLlama 13B Model

```powershell
docker exec -it ollama ollama pull codellama:13b
```

**Note**: This downloads ~7GB and may take time depending on internet connection.

## Step 4: Test the Installation

```powershell
Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body '{"model": "codellama:13b", "prompt": "Write a Python function to call Microsoft Graph API", "stream": false}' -ContentType "application/json"
```

## Step 5: Verify Available Models

```powershell
docker exec -it ollama ollama list
```

## Using with EntraPulse Lite

EntraPulse Lite integrates seamlessly with your local Ollama instance:

1. **Automatic Detection**: The application automatically detects your running Ollama instance
2. **Real-time Status Monitoring**: The app continuously checks for local LLM availability
3. **Dynamic Switching**: If Ollama becomes unavailable during use, EntraPulse Lite will notify you and can fall back to cloud providers if configured
4. **Status Indicator**: The LLM status is displayed in the UI with real-time updates

To use your local Ollama instance:
1. Ensure Ollama is running (see steps above)
2. Launch EntraPulse Lite
3. In Settings, ensure "Use Local LLM if available" is enabled
4. The status indicator will show "Local LLM Online" when connected successfully

If you start or stop Ollama after launching EntraPulse Lite, the application will detect the change automatically through its background status monitoring.

## Troubleshooting

### Local LLM Not Detected
1. Verify Ollama is running: `docker ps`
2. Check API access: `Invoke-RestMethod -Uri "http://localhost:11434/api/version" -Method Get`
3. Use the "Refresh" button on the LLM status indicator to force an immediate check
4. Restart EntraPulse Lite if needed

## API Usage in Applications

The Ollama API is available at `http://localhost:11434`. Example Python integration:

```python
import requests

def query_llm(prompt, model="codellama:13b"):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False
        }
    )
    return response.json()["response"]

# Example usage
result = query_llm("Generate code to create a user in Entra ID using Microsoft Graph API")
```

## System Requirements
- **CodeLlama 13B**: ~8GB RAM
- **Alternative**: CodeLlama 7B (~4GB RAM) if memory is limited
