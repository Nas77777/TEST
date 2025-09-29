# Backend Setup

## Environment Variables

This application requires an OpenAI API key to function properly.

### Local Development Setup

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and replace `your_openai_api_key_here` with your actual OpenAI API key:

   ```
   api_key="sk-proj-your-actual-api-key-here"
   ```

3. Never commit the `.env` file to version control as it contains sensitive information.

### Production Deployment Setup

For production deployments (Railway, Heroku, etc.), set the environment variable through your platform's dashboard:

**Railway:**

1. Go to your Railway project dashboard
2. Navigate to the backend service
3. Go to "Variables" tab
4. Add a new variable:
   - Name: `OPENAI_API_KEY`
   - Value: `your_actual_openai_api_key_here`

**Other platforms:**
Set the environment variable `OPENAI_API_KEY` with your OpenAI API key value.

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

## Deployment

The application is configured to work with Railway using the `railway.toml` configuration file. Make sure to set the `OPENAI_API_KEY` environment variable in your Railway dashboard before deploying.

## Security Note

The `.env` file is included in `.gitignore` to prevent accidental commits of sensitive information. Always use environment variables for production deployments.
