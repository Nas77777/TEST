# Backend Setup

## Environment Variables

This application requires an OpenAI API key to function properly.

### Setup Instructions

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and replace `your_openai_api_key_here` with your actual OpenAI API key:
   ```
   api_key="sk-proj-your-actual-api-key-here"
   ```

3. Never commit the `.env` file to version control as it contains sensitive information.

## Installation

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On macOS/Linux
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:
   ```bash
   flask run
   ```

## Security Note

The `.env` file is included in `.gitignore` to prevent accidental commits of sensitive information.