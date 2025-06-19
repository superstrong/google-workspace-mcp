# Google Workspace MCP - Cloud Deployment Guide

This guide covers the deployment and usage of the serverless, event-driven Google Workspace MCP system running on Google Cloud Functions.

## 🏗️ Architecture Overview

The system has been redesigned as a hybrid architecture supporting both local development and cloud production:

### Local Development
- Original Docker-based MCP server for development
- Stdio transport for AI client compatibility
- Local file storage and OAuth callback server

### Cloud Production
- Serverless Google Cloud Functions for ultra-low cost
- Event-driven architecture triggered by Apps Script
- Enterprise-grade security with multi-layer authentication
- Comprehensive QA testing framework

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Project**
   ```bash
   # Set your project ID
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   gcloud config set project $GOOGLE_CLOUD_PROJECT
   ```

2. **Required APIs** (automatically enabled by deployment script)
   - Cloud Functions API
   - Secret Manager API
   - Firestore API
   - Gmail API
   - Calendar API
   - Drive API

3. **OAuth Credentials**
   - Create OAuth 2.0 credentials in Google Cloud Console
   - Set redirect URI to your domain (for cloud deployment)

### One-Command Deployment

```bash
# Deploy to staging environment
./scripts/deploy-cloud-functions.sh staging

# Deploy to production
./scripts/deploy-cloud-functions.sh production
```

The deployment script will:
- ✅ Enable required Google Cloud APIs
- ✅ Set up Secret Manager secrets
- ✅ Initialize Firestore database
- ✅ Configure IAM permissions
- ✅ Deploy Cloud Functions
- ✅ Run health checks

## 🔧 Manual Setup

### 1. Configure Secrets

```bash
# Add your OAuth credentials
echo "your-client-id" | gcloud secrets versions add google-client-id --data-file=-
echo "your-client-secret" | gcloud secrets versions add google-client-secret --data-file=-

# Security secrets are auto-generated during deployment
```

### 2. Deploy Individual Functions

```bash
# Gmail function
cd cloud-functions/gmail-function
npm install && npm run build
gcloud functions deploy gmail-handler-staging \
  --runtime=nodejs20 \
  --trigger=http \
  --memory=512MB \
  --timeout=60s

# QA Dashboard
cd ../qa-dashboard
npm install && npm run build
gcloud functions deploy qa-dashboard \
  --runtime=nodejs20 \
  --trigger=http \
  --memory=256MB \
  --timeout=30s
```

## 🔐 Security Features

### Multi-Layer Authentication
1. **JWT Token Verification** - Apps Script requests must include valid JWT
2. **Origin Validation** - Only requests from Google Apps Script domains
3. **Request Signing** - HMAC signature verification for request integrity
4. **User Authorization** - Email-based access control
5. **Response Sanitization** - Remove sensitive data before sending

### Data Protection
- **Secret Manager** - OAuth tokens encrypted at rest
- **Firestore** - Account metadata with access controls
- **Audit Logging** - Complete audit trail for compliance
- **Zero Data Leakage** - VPC isolation and strict firewall rules

### Security Configuration

```javascript
// Example Apps Script authentication
function callMCPFunction(operation, params) {
  const token = generateJWTToken(userEmail);
  const signature = generateHMACSignature(payload);
  
  const response = UrlFetchApp.fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Request-Signature': signature,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      operation,
      email: userEmail,
      params
    })
  });
}
```

## 🧪 QA Testing Framework

### Access QA Dashboard
```
https://REGION-PROJECT_ID.cloudfunctions.net/qa-dashboard
```

### Features
- **Event Simulation** - Test email/calendar events with existing data
- **Authentication Testing** - Verify token status and account health
- **Function Testing** - Test individual Cloud Functions
- **Real Data Testing** - Use actual emails/events for realistic testing

### Simulation Examples

```javascript
// Simulate email event
{
  "email": "user@example.com",
  "emailId": "optional-specific-email-id",
  "prompt": "Analyze this email and suggest actions",
  "scenario": "urgent_email"
}

// Simulate calendar event
{
  "email": "user@example.com", 
  "eventId": "optional-specific-event-id",
  "prompt": "Handle this calendar event",
  "scenario": "meeting_created"
}
```

## 📱 Apps Script Integration

### Basic Setup

```javascript
// Apps Script configuration
const MCP_CONFIG = {
  gmailFunction: 'https://us-central1-PROJECT.cloudfunctions.net/gmail-handler-production',
  calendarFunction: 'https://us-central1-PROJECT.cloudfunctions.net/calendar-handler-production',
  jwtSecret: 'your-jwt-secret', // Store in Apps Script properties
  userEmail: Session.getActiveUser().getEmail()
};

// Email trigger
function onEmailReceived(email) {
  const response = callMCPFunction('search', {
    search: { from: email.getFrom() },
    options: { maxResults: 1 }
  });
  
  // Process AI response
  console.log('MCP Response:', response);
}

// Calendar trigger  
function onCalendarEvent(event) {
  const response = callMCPFunction('calendar', {
    eventId: event.getId(),
    action: 'analyze'
  });
  
  // Handle calendar event
  console.log('Calendar Analysis:', response);
}
```

### Advanced Triggers

```javascript
// Gmail trigger with filters
function setupGmailTrigger() {
  const trigger = ScriptApp.newTrigger('onEmailReceived')
    .gmail()
    .onReceived()
    .create();
}

// Calendar trigger
function setupCalendarTrigger() {
  const trigger = ScriptApp.newTrigger('onCalendarEvent')
    .calendar()
    .onEventUpdated()
    .create();
}
```

## 💰 Cost Optimization

### Estimated Monthly Costs

**Light Usage (1,000 events/month)**
- Cloud Functions: $0.50
- Secret Manager: $0.10
- Firestore: $0.25
- **Total: ~$1.35/month**

**Heavy Usage (10,000 events/month)**
- Cloud Functions: $5.00
- Secret Manager: $0.50
- Firestore: $1.00
- **Total: ~$7.00/month**

### Cost Optimization Tips
- Functions auto-scale to zero when not in use
- Use minimum memory allocation (128MB-256MB)
- Set aggressive timeouts (30s-60s)
- Leverage free tier limits

## 🔍 Monitoring & Debugging

### Cloud Logging
```bash
# View function logs
gcloud functions logs read gmail-handler-staging --limit=50

# View security events
gcloud logging read 'resource.type="cloud_function" AND jsonPayload.eventType="AUTH_FAILURE"'
```

### Health Checks
```bash
# Run health checks
./scripts/deploy-cloud-functions.sh health

# Test specific function
curl -X POST https://REGION-PROJECT.cloudfunctions.net/gmail-handler-staging \
  -H "Content-Type: application/json" \
  -d '{"operation":"health-check","email":"test@example.com"}'
```

### Performance Monitoring
- **Cloud Monitoring** - Function execution metrics
- **Error Reporting** - Automatic error detection
- **Audit Logs** - Complete security audit trail

## 🛠️ Development Workflow

### Local Development
```bash
# Start local MCP server (existing functionality)
npm run dev:local

# Test with AI client locally
# Uses stdio transport and local OAuth
```

### Cloud Development
```bash
# Deploy to staging
./scripts/deploy-cloud-functions.sh staging

# Test with QA dashboard
open https://REGION-PROJECT.cloudfunctions.net/qa-dashboard

# Deploy to production
./scripts/deploy-cloud-functions.sh production
```

### Hybrid Testing
```bash
# Test locally
npm run dev:local

# Test in cloud
npm run test:cloud

# Compare results
npm run test:compare
```

## 📋 Available Functions

### Gmail Function
- **URL**: `https://REGION-PROJECT.cloudfunctions.net/gmail-handler-ENV`
- **Operations**: search, send, draft, label, attachment, settings
- **Memory**: 512MB
- **Timeout**: 60s

### Calendar Function (Coming Soon)
- **URL**: `https://REGION-PROJECT.cloudfunctions.net/calendar-handler-ENV`
- **Operations**: list, create, update, delete events
- **Memory**: 256MB
- **Timeout**: 30s

### Drive Function (Coming Soon)
- **URL**: `https://REGION-PROJECT.cloudfunctions.net/drive-handler-ENV`
- **Operations**: list, search, upload, download, permissions
- **Memory**: 512MB
- **Timeout**: 60s

### QA Dashboard
- **URL**: `https://REGION-PROJECT.cloudfunctions.net/qa-dashboard`
- **Features**: Event simulation, auth testing, function testing
- **Memory**: 256MB
- **Timeout**: 30s

## 🚨 Troubleshooting

### Common Issues

**Authentication Errors**
```bash
# Check token status
gcloud secrets versions access latest --secret="user-token-EMAIL"

# Verify account in Firestore
gcloud firestore documents list accounts
```

**Function Deployment Errors**
```bash
# Check function status
gcloud functions describe FUNCTION_NAME --region=REGION

# View deployment logs
gcloud functions logs read FUNCTION_NAME --limit=20
```

**Permission Issues**
```bash
# Check IAM bindings
gcloud projects get-iam-policy PROJECT_ID

# Grant missing permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT" \
  --role="ROLE"
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Deploy with debug mode
./scripts/deploy-cloud-functions.sh staging
```

## 🔄 Migration from Local to Cloud

### Step 1: Export Local Data
```bash
# Export account configurations
cp ~/.mcp/google-workspace-mcp/accounts.json ./migration/

# Export tokens (will be re-encrypted in cloud)
cp -r ~/.mcp/google-workspace-mcp/credentials/ ./migration/
```

### Step 2: Deploy Cloud Infrastructure
```bash
./scripts/deploy-cloud-functions.sh staging
```

### Step 3: Migrate Tokens
```bash
# Import tokens to Secret Manager
./scripts/migrate-tokens.sh ./migration/credentials/
```

### Step 4: Update Apps Script
```javascript
// Change from local to cloud endpoints
const MCP_ENDPOINT = 'https://REGION-PROJECT.cloudfunctions.net/gmail-handler-production';
```

## 📚 Additional Resources

- [Google Cloud Functions Documentation](https://cloud.google.com/functions/docs)
- [Apps Script Triggers Guide](https://developers.google.com/apps-script/guides/triggers)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

## 🤝 Support

For issues and questions:
1. Check the QA Dashboard for function status
2. Review Cloud Logging for error details
3. Run health checks with the deployment script
4. Submit issues with detailed logs and error messages

---

**Next Steps**: After deployment, configure your Apps Script triggers and test the system using the QA Dashboard.
