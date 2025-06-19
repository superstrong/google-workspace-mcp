# Getting Started: From Local to Cloud Deployment

This guide explains exactly how to deploy your Google Workspace MCP system to the cloud, step by step.

## 🏠 Where You Run Everything

**You run everything from YOUR LOCAL COMPUTER** - not on Google Cloud. The deployment script uploads your code to Google Cloud for you.

### What Happens:
1. **Your Computer**: You run the deployment script locally
2. **Google Cloud**: The script uploads and deploys your functions to Google Cloud
3. **Result**: Your functions run in Google Cloud, but you control them from your computer

## 📋 Prerequisites (One-Time Setup)

### 1. Install Google Cloud CLI

**On macOS:**
```bash
# Install using Homebrew
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

**On Windows:**
```bash
# Download and run the installer from:
# https://cloud.google.com/sdk/docs/install-windows
```

**On Linux:**
```bash
# Follow instructions at:
# https://cloud.google.com/sdk/docs/install-linux
```

### 2. Set Up Automatic Project Switching (Recommended)

For seamless project management across multiple repositories, set up automatic gcloud project switching:

#### Install direnv
```bash
# On macOS
brew install direnv

# On Linux
sudo apt install direnv  # or your package manager
```

#### Configure your shell
Add this to your shell configuration file (`~/.zshrc`, `~/.bashrc`, etc.):
```bash
eval "$(direnv hook zsh)"  # or bash, fish, etc.
```

Then reload your shell:
```bash
source ~/.zshrc  # or your shell config file
```

#### Set up project-specific configuration
```bash
# Create a named gcloud configuration for this project
gcloud config configurations create workspace-mcp

# Set your project ID (replace with your actual project ID)
gcloud config set project your-project-id

# Verify the configuration
gcloud config get-value project
```

The repository already includes a `.envrc` file that will automatically switch to the correct gcloud project when you enter this directory. You just need to allow it:

```bash
# In the repository root, allow direnv to execute
direnv allow
```

Now whenever you `cd` into this repository, gcloud will automatically use the correct project!

### 3. Set Up Google Cloud Project

```bash
# Login to Google Cloud (opens browser)
gcloud auth login

# Create a new project (or use existing)
gcloud projects create your-project-name --name="Google Workspace MCP"

# Set your project in the workspace-mcp configuration
gcloud config configurations activate workspace-mcp
gcloud config set project your-project-name

# Enable billing (required for Cloud Functions)
# Go to: https://console.cloud.google.com/billing
# Link your project to a billing account
```

### 4. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback` (for local testing)
   - `https://your-domain.com/auth/callback` (if you have a domain)
7. Save the **Client ID** and **Client Secret**

## 🚀 Enhanced Deployment Process

The deployment script now handles everything automatically, including service account creation and IAM permissions.

### Step 1: Prepare Your Local Environment

```bash
# Navigate to your project directory
cd /path/to/google-workspace-mcp

# Verify direnv is working (should show project switch message)
# If you see: "🔧 Switched to gcloud project: your-project-id" - you're ready!

# Verify the deployment script exists
ls scripts/deploy-cloud-functions.sh
```

### Step 2: Deploy to Staging (Test Environment)

```bash
# Full deployment to staging
./scripts/deploy-cloud-functions.sh deploy staging

# Or simply (deploy is the default command, staging is default environment)
./scripts/deploy-cloud-functions.sh
```

**What this does automatically:**
- ✅ Enables required Google Cloud APIs
- ✅ Creates dedicated service account with minimal permissions
- ✅ Sets up IAM roles and permissions
- ✅ Creates security secrets in Secret Manager
- ✅ Initializes Firestore database
- ✅ Builds and deploys all 7 Cloud Functions
- ✅ Runs health checks

### Step 3: Add Your OAuth Credentials

After deployment, add your Google OAuth credentials:

```bash
# Add your OAuth Client ID
echo 'your-client-id-here' | gcloud secrets versions add google-client-id --data-file=-

# Add your OAuth Client Secret  
echo 'your-client-secret-here' | gcloud secrets versions add google-client-secret --data-file=-
```

### Step 4: Test Your Deployment

The script will give you URLs like:
```
QA Dashboard: https://us-central1-your-project.cloudfunctions.net/qa-dashboard-staging
MCP Gateway: https://us-central1-your-project.cloudfunctions.net/mcp-gateway-staging
```

Open the QA Dashboard URL in your browser to test everything works.

## 🛠️ Advanced Deployment Options

### Environment-Specific Deployments

```bash
# Deploy to different environments
./scripts/deploy-cloud-functions.sh deploy staging
./scripts/deploy-cloud-functions.sh deploy production
./scripts/deploy-cloud-functions.sh deploy development
```

### Partial Operations

```bash
# Setup secrets only
./scripts/deploy-cloud-functions.sh secrets production

# Run health checks only
./scripts/deploy-cloud-functions.sh health staging

# Preview what would be deployed (dry run)
./scripts/deploy-cloud-functions.sh deploy production --dry-run
```

### Function Management

```bash
# Remove all functions from an environment
./scripts/deploy-cloud-functions.sh cleanup staging

# Remove specific function
./scripts/deploy-cloud-functions.sh cleanup staging gmail

# Force removal without confirmation
./scripts/deploy-cloud-functions.sh cleanup staging --force

# Preview cleanup (dry run)
./scripts/deploy-cloud-functions.sh cleanup production --dry-run
```

### Get Help

```bash
# See all available commands and options
./scripts/deploy-cloud-functions.sh help
```

## 🔐 Security & Service Accounts

The deployment script automatically creates a dedicated service account (`workspace-mcp-functions`) with minimal required permissions:

- **Secret Manager Access**: Read OAuth credentials and JWT secrets
- **Firestore Access**: Store and retrieve account data
- **Logging**: Write function logs
- **Monitoring**: Write metrics

This follows security best practices by using the principle of least privilege. No manual service account setup is required!

## 🧪 Testing Your Functions

### Using the QA Dashboard

1. **Open the QA Dashboard URL** (provided after deployment)
2. **Enter your email address** (the one you used for Google OAuth)
3. **Test Authentication** - Click "Test Authentication"
4. **Simulate Events** - Try simulating email or calendar events
5. **Check Results** - Verify everything works

### Manual Testing

```bash
# Test a function directly
curl -X POST https://us-central1-your-project.cloudfunctions.net/gmail-handler-staging \
  -H "Content-Type: application/json" \
  -d '{"operation":"health-check","email":"your-email@gmail.com"}'
```

## 📱 Setting Up Apps Script Integration

### Step 1: Create Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click "New Project"
3. Copy the code from `google-apps-script/mcp-integration.js`
4. Paste it into your Apps Script editor

### Step 2: Configure Apps Script

```javascript
// Update these URLs in your Apps Script
const MCP_CONFIG = {
  gmailFunction: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/gmail-handler-staging',
  calendarFunction: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/calendar-handler-staging',
  // ... other functions
};
```

### Step 3: Set Up Secrets in Apps Script

1. In Apps Script, go to "Project Settings" → "Script Properties"
2. Add these properties:
   - `MCP_JWT_SECRET`: Get from Google Secret Manager
   - `MCP_REQUEST_SIGNING_SECRET`: Get from Google Secret Manager

```bash
# Get the secrets from Google Cloud
gcloud secrets versions access latest --secret="jwt-secret"
gcloud secrets versions access latest --secret="request-signing-secret"
```

### Step 4: Initialize Apps Script

```javascript
// Run this function once in Apps Script
initializeMCPIntegration();
```

## 🔄 Deploy to Production

Once everything works in staging:

```bash
# Deploy to production
./scripts/deploy-cloud-functions.sh deploy production
```

Update your Apps Script URLs to use `-production` instead of `-staging`.

## 💰 Cost Management

### Monitor Costs

```bash
# Check current usage
gcloud functions list --regions=us-central1

# View logs
gcloud functions logs read gmail-handler-staging --limit=50
```

### Expected Costs
- **Light usage** (1,000 events/month): ~$1.35
- **Heavy usage** (10,000 events/month): ~$7.00
- **Free tier**: 2 million invocations per month

## 🚨 Troubleshooting

### Common Issues

**"Permission denied" errors:**
```bash
# Re-authenticate
gcloud auth login
gcloud auth application-default login
```

**"Project not found" errors:**
```bash
# Verify project exists
gcloud projects list

# Set correct project (if not using direnv)
gcloud config set project your-correct-project-id

# Or activate the correct configuration
gcloud config configurations activate workspace-mcp
```

**"Billing not enabled" errors:**
- Go to [Google Cloud Console](https://console.cloud.google.com/billing)
- Enable billing for your project

**Service account errors:**
- The deployment script now handles service account creation automatically
- If you see service account errors, try running the deployment again

**Functions not deploying:**
```bash
# Check if APIs are enabled
gcloud services list --enabled

# The deployment script enables APIs automatically, but you can do it manually:
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

**TypeScript compilation errors:**
```bash
# If you see missing type definitions, install them:
cd cloud-functions/[function-name]
npm install --save-dev @types/[missing-package]
```

### Getting Help

1. **Check function logs:**
   ```bash
   gcloud functions logs read FUNCTION-NAME --limit=20
   ```

2. **Test individual functions:**
   ```bash
   # Use the QA Dashboard URL provided after deployment
   ```

3. **Verify secrets:**
   ```bash
   gcloud secrets list
   ```

4. **Check service account:**
   ```bash
   gcloud iam service-accounts list
   ```

## 🔄 Multi-Project Workflow

If you work with multiple Google Cloud projects:

### For Each Repository:
1. **Create a named gcloud configuration:**
   ```bash
   gcloud config configurations create project-name
   gcloud config set project your-project-id
   ```

2. **Create `.envrc` file in repository root:**
   ```bash
   # Automatically switch to project-name gcloud configuration
   gcloud config configurations activate project-name
   echo "🔧 Switched to gcloud project: $(gcloud config get-value project)"
   ```

3. **Allow direnv:**
   ```bash
   direnv allow
   ```

4. **Add to .gitignore:**
   ```bash
   echo ".envrc" >> .gitignore
   ```

Now each repository automatically uses its own Google Cloud project!

## 📁 File Structure Summary

```
Your Local Computer:
/path/to/google-workspace-mcp/
├── .envrc                            ← Auto-switches gcloud project
├── scripts/deploy-cloud-functions.sh ← Enhanced deployment script
├── cloud-functions/                  ← This gets uploaded to Google Cloud
├── google-apps-script/              ← You copy this to Apps Script
└── CLOUD_DEPLOYMENT.md             ← Detailed reference

Google Cloud (after deployment):
├── 7 Cloud Functions running your code
├── Dedicated service account (workspace-mcp-functions)
├── Secret Manager storing your credentials  
├── Firestore database for account data
└── Audit logs for security tracking
```

## ✅ Success Checklist

- [ ] Google Cloud CLI installed and authenticated
- [ ] direnv installed and configured (optional but recommended)
- [ ] Google Cloud project created with billing enabled
- [ ] Project-specific gcloud configuration created
- [ ] OAuth credentials created and saved
- [ ] Deployment script runs successfully
- [ ] Service account created automatically
- [ ] QA Dashboard accessible and working
- [ ] Apps Script configured and tested
- [ ] Functions responding to real events

## 🎉 You're Done!

Once you complete these steps, you'll have:
- ✅ All 19 MCP tools running as serverless functions
- ✅ Automatic project switching with direnv
- ✅ Dedicated service account with minimal permissions
- ✅ Ultra-low cost operation (pay only for usage)
- ✅ Enterprise-grade security
- ✅ Event-driven automation via Apps Script
- ✅ Comprehensive testing and monitoring
- ✅ Easy multi-environment deployments

Your Google Workspace will now automatically trigger AI analysis whenever emails arrive or calendar events change!
