#!/bin/bash

# Google Workspace MCP Cloud Functions Deployment Script
# This script deploys the serverless MCP functions to Google Cloud

set -e

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-""}
REGION=${REGION:-"us-central1"}

# Parse command line arguments
COMMAND=""
ENVIRONMENT="staging"
DRY_RUN=false
FORCE=false
SPECIFIC_FUNCTION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        deploy|secrets|health|cleanup|remove|help|-h|--help)
            if [[ -z "$COMMAND" ]]; then
                COMMAND="$1"
            fi
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        staging|production|development|dev|prod)
            ENVIRONMENT="$1"
            shift
            ;;
        gmail|calendar|drive|account|contacts|mcp-gateway|qa-dashboard)
            SPECIFIC_FUNCTION="$1"
            shift
            ;;
        *)
            # If no command set yet and this looks like an environment, treat it as such
            if [[ -z "$COMMAND" ]] && [[ "$1" =~ ^(staging|production|development|dev|prod)$ ]]; then
                ENVIRONMENT="$1"
                COMMAND="deploy"
            elif [[ -z "$COMMAND" ]]; then
                # If no command set and not a recognized environment, treat as environment anyway
                ENVIRONMENT="$1"
                COMMAND="deploy"
            fi
            shift
            ;;
    esac
done

# Set default command if none specified
if [[ -z "$COMMAND" ]]; then
    COMMAND="deploy"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
        if [ -z "$PROJECT_ID" ]; then
            log_error "Google Cloud Project ID not set. Set GOOGLE_CLOUD_PROJECT environment variable or run 'gcloud config set project PROJECT_ID'"
            exit 1
        fi
    fi
    
    log_info "Using project: $PROJECT_ID"
    log_info "Using region: $REGION"
    log_info "Environment: $ENVIRONMENT"
    
    # Check if APIs are enabled
    log_info "Checking required APIs..."
    
    local required_apis=(
        "cloudfunctions.googleapis.com"
        "secretmanager.googleapis.com"
        "firestore.googleapis.com"
        "gmail.googleapis.com"
        "calendar-json.googleapis.com"
        "drive.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
    )
    
    for api in "${required_apis[@]}"; do
        if ! gcloud services list --enabled --filter="name:$api" --format="value(name)" | grep -q "$api"; then
            log_warning "Enabling API: $api"
            gcloud services enable "$api" --project="$PROJECT_ID"
        else
            log_info "API already enabled: $api"
        fi
    done
}

# Setup secrets in Secret Manager
setup_secrets() {
    log_info "Setting up secrets in Secret Manager..."
    
    local secrets=(
        "jwt-secret"
        "request-signing-secret"
        "google-client-id"
        "google-client-secret"
    )
    
    for secret in "${secrets[@]}"; do
        if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
            log_info "Creating secret: $secret"
            gcloud secrets create "$secret" \
                --replication-policy="automatic" \
                --project="$PROJECT_ID"
            
            # Generate random values for security secrets
            case $secret in
                "jwt-secret"|"request-signing-secret")
                    local random_value=$(openssl rand -base64 32)
                    echo -n "$random_value" | gcloud secrets versions add "$secret" \
                        --data-file=- \
                        --project="$PROJECT_ID"
                    log_success "Generated and stored random value for $secret"
                    ;;
                "google-client-id"|"google-client-secret")
                    log_warning "Please manually add your Google OAuth credentials to secret: $secret"
                    log_info "Run: echo 'YOUR_VALUE' | gcloud secrets versions add $secret --data-file=- --project=$PROJECT_ID"
                    ;;
            esac
        else
            log_info "Secret already exists: $secret"
        fi
    done
}

# Setup Firestore
setup_firestore() {
    log_info "Setting up Firestore..."
    
    # Check if Firestore is already initialized
    if ! gcloud firestore databases describe --database="(default)" --project="$PROJECT_ID" &>/dev/null; then
        log_info "Initializing Firestore..."
        gcloud firestore databases create \
            --location="$REGION" \
            --project="$PROJECT_ID"
        log_success "Firestore initialized"
    else
        log_info "Firestore already initialized"
    fi
}

# List deployed functions for an environment
list_deployed_functions() {
    local env=$1
    log_info "Listing deployed functions for environment: $env"
    
    local function_names=(
        "account-handler-${env}"
        "gmail-handler-${env}"
        "calendar-handler-${env}"
        "drive-handler-${env}"
        "contacts-handler-${env}"
        "mcp-gateway-${env}"
        "qa-dashboard-${env}"
    )
    
    local deployed_functions=()
    
    for func in "${function_names[@]}"; do
        if gcloud functions describe "$func" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
            deployed_functions+=("$func")
            log_info "  ✓ $func"
        fi
    done
    
    if [ ${#deployed_functions[@]} -eq 0 ]; then
        log_info "No functions found for environment: $env"
        return 1
    fi
    
    return 0
}

# Remove individual Cloud Function
cleanup_function() {
    local function_name=$1
    local env=$2
    
    local full_function_name="${function_name}-${env}"
    
    if gcloud functions describe "$full_function_name" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would delete function: $full_function_name"
        else
            log_info "Deleting function: $full_function_name"
            gcloud functions delete "$full_function_name" \
                --region="$REGION" \
                --project="$PROJECT_ID" \
                --quiet
            log_success "Function $full_function_name deleted successfully"
        fi
    else
        log_warning "Function $full_function_name not found"
    fi
}

# Remove all functions for an environment
cleanup_environment() {
    local env=$1
    
    log_info "🧹 Starting cleanup for environment: $env"
    
    local function_names=(
        "account-handler"
        "gmail-handler"
        "calendar-handler"
        "drive-handler"
        "contacts-handler"
        "mcp-gateway"
        "qa-dashboard"
    )
    
    # Check what's deployed first
    log_info "Checking deployed functions..."
    if ! list_deployed_functions "$env"; then
        log_info "Nothing to clean up for environment: $env"
        return 0
    fi
    
    # Confirmation prompt (unless --force is used)
    if [ "$FORCE" != true ] && [ "$DRY_RUN" != true ]; then
        echo ""
        log_warning "⚠️  This will DELETE all Cloud Functions for environment: $env"
        log_warning "This action cannot be undone!"
        echo ""
        read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation
        
        if [ "$confirmation" != "yes" ]; then
            log_info "Cleanup cancelled"
            return 0
        fi
    fi
    
    # Remove functions
    for func in "${function_names[@]}"; do
        cleanup_function "$func" "$env"
    done
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Cleanup simulation completed for environment: $env"
    else
        log_success "✅ Cleanup completed for environment: $env"
    fi
}

# Remove specific function
cleanup_specific_function() {
    local func_type=$1
    local env=$2
    
    local function_name=""
    case $func_type in
        "gmail")
            function_name="gmail-handler"
            ;;
        "calendar")
            function_name="calendar-handler"
            ;;
        "drive")
            function_name="drive-handler"
            ;;
        "account")
            function_name="account-handler"
            ;;
        "contacts")
            function_name="contacts-handler"
            ;;
        "mcp-gateway")
            function_name="mcp-gateway"
            ;;
        "qa-dashboard")
            function_name="qa-dashboard"
            ;;
    esac
    
    if [ -z "$function_name" ]; then
        log_error "Unknown function type: $func_type"
        log_info "Valid types: gmail, calendar, drive, account, contacts, mcp-gateway, qa-dashboard"
        return 1
    fi
    
    log_info "🧹 Cleaning up specific function: $function_name for environment: $env"
    
    # Confirmation prompt (unless --force is used)
    if [ "$FORCE" != true ] && [ "$DRY_RUN" != true ]; then
        echo ""
        log_warning "⚠️  This will DELETE the $function_name function for environment: $env"
        read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation
        
        if [ "$confirmation" != "yes" ]; then
            log_info "Cleanup cancelled"
            return 0
        fi
    fi
    
    cleanup_function "$function_name" "$env"
}

# Deploy individual Cloud Function
deploy_function() {
    local function_dir=$1
    local function_name=$2
    local entry_point=$3
    local memory=${4:-512MB}
    local timeout=${5:-60s}
    
    log_info "Deploying $function_name function..."
    
    cd "cloud-functions/$function_dir"
    
    # Build the function
    log_info "Building $function_name function..."
    npm install
    npm run build
    
    # Deploy to Cloud Functions
    local full_function_name="${function_name}-${ENVIRONMENT}"
    local sa_email="workspace-mcp-functions@${PROJECT_ID}.iam.gserviceaccount.com"
    
    gcloud functions deploy "$full_function_name" \
        --runtime=nodejs20 \
        --trigger-http \
        --allow-unauthenticated \
        --memory="$memory" \
        --timeout="$timeout" \
        --region="$REGION" \
        --source=. \
        --entry-point="$entry_point" \
        --service-account="$sa_email" \
        --set-env-vars="ENVIRONMENT=${ENVIRONMENT},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},REGION=${REGION}" \
        --project="$PROJECT_ID"
    
    # Get the function URL
    local function_url=$(gcloud functions describe "$full_function_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(httpsTrigger.url)")
    
    log_success "$function_name function deployed successfully!"
    log_info "Function URL: $function_url"
    
    cd ../..
}

# Deploy Gmail function
deploy_gmail_function() {
    deploy_function "gmail-function" "gmail-handler" "gmailHandler" "512MB" "60s"
}

# Deploy Calendar function
deploy_calendar_function() {
    deploy_function "calendar-function" "calendar-handler" "calendarHandler" "512MB" "60s"
}

# Deploy Drive function
deploy_drive_function() {
    deploy_function "drive-function" "drive-handler" "driveHandler" "512MB" "60s"
}

# Deploy Account function
deploy_account_function() {
    deploy_function "account-function" "account-handler" "accountHandler" "256MB" "30s"
}

# Deploy Contacts function
deploy_contacts_function() {
    deploy_function "contacts-function" "contacts-handler" "contactsHandler" "256MB" "30s"
}

# Deploy MCP Gateway function
deploy_mcp_gateway() {
    deploy_function "mcp-gateway" "mcp-gateway" "mcpGateway" "256MB" "30s"
}

# Deploy QA Dashboard
deploy_qa_dashboard() {
    deploy_function "qa-dashboard" "qa-dashboard" "qaDashboard" "256MB" "30s"
}

# Setup IAM permissions
setup_iam() {
    log_info "Setting up IAM permissions..."
    
    # Define service account details
    local sa_name="workspace-mcp-functions"
    local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"
    local sa_display_name="Google Workspace MCP Functions"
    local sa_description="Service account for Google Workspace MCP Cloud Functions"
    
    # Check if service account exists
    if ! gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null; then
        log_info "Creating service account: $sa_name"
        gcloud iam service-accounts create "$sa_name" \
            --display-name="$sa_display_name" \
            --description="$sa_description" \
            --project="$PROJECT_ID"
        log_success "Service account created: $sa_email"
    else
        log_info "Service account already exists: $sa_email"
    fi
    
    # Grant necessary permissions to the service account
    local roles=(
        "roles/secretmanager.secretAccessor"
        "roles/datastore.user"
        "roles/logging.logWriter"
        "roles/monitoring.metricWriter"
    )
    
    for role in "${roles[@]}"; do
        log_info "Granting role $role to $sa_email"
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$sa_email" \
            --role="$role" \
            --quiet
    done
    
    log_success "IAM permissions configured for service account: $sa_email"
}

# Health check
health_check() {
    log_info "Running health checks..."
    
    # Check if functions are deployed
    local functions=(
        "gmail-handler-${ENVIRONMENT}"
    )
    
    for func in "${functions[@]}"; do
        if gcloud functions describe "$func" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
            log_success "Function $func is deployed"
        else
            log_error "Function $func is not deployed"
        fi
    done
}

# Main deployment flow
main() {
    log_info "🚀 Starting Google Workspace MCP Cloud Functions deployment..."
    log_info "Environment: $ENVIRONMENT"
    
    check_prerequisites
    setup_secrets
    setup_firestore
    setup_iam
    
    # Deploy all functions
    deploy_account_function
    deploy_gmail_function
    deploy_calendar_function
    deploy_drive_function
    deploy_contacts_function
    deploy_mcp_gateway
    deploy_qa_dashboard
    
    health_check
    
    log_success "✅ All Cloud Functions deployed successfully!"
    log_info ""
    log_info "📋 Deployed Functions:"
    log_info "  👤 Account Management: account-handler-${ENVIRONMENT}"
    log_info "  📧 Gmail Operations: gmail-handler-${ENVIRONMENT}"
    log_info "  📅 Calendar Operations: calendar-handler-${ENVIRONMENT}"
    log_info "  📁 Drive Operations: drive-handler-${ENVIRONMENT}"
    log_info "  📞 Contacts Operations: contacts-handler-${ENVIRONMENT}"
    log_info "  🌐 MCP Gateway: mcp-gateway-${ENVIRONMENT}"
    log_info "  🧪 QA Dashboard: qa-dashboard-${ENVIRONMENT}"
    log_info ""
    log_info "🔧 Next steps:"
    log_info "1. Add your Google OAuth credentials to Secret Manager:"
    log_info "   echo 'YOUR_CLIENT_ID' | gcloud secrets versions add google-client-id --data-file=-"
    log_info "   echo 'YOUR_CLIENT_SECRET' | gcloud secrets versions add google-client-secret --data-file=-"
    log_info "2. Test functions using QA Dashboard: https://${REGION}-${PROJECT_ID}.cloudfunctions.net/qa-dashboard-${ENVIRONMENT}"
    log_info "3. Configure Apps Script to use MCP Gateway: https://${REGION}-${PROJECT_ID}.cloudfunctions.net/mcp-gateway-${ENVIRONMENT}"
    log_info "4. All ${#allTools[@]} original MCP tools are now available as serverless functions!"
}

# Handle script commands
case "$COMMAND" in
    "deploy")
        main
        ;;
    "secrets")
        check_prerequisites
        setup_secrets
        ;;
    "health")
        check_prerequisites
        health_check
        ;;
    "cleanup"|"remove")
        check_prerequisites
        if [ -n "$SPECIFIC_FUNCTION" ]; then
            cleanup_specific_function "$SPECIFIC_FUNCTION" "$ENVIRONMENT"
        else
            cleanup_environment "$ENVIRONMENT"
        fi
        ;;
    "help"|"-h"|"--help")
        echo "Google Workspace MCP Cloud Functions Deployment Script"
        echo ""
        echo "Usage: $0 [COMMAND] [ENVIRONMENT] [OPTIONS]"
        echo ""
        echo "Commands:"
        echo "  deploy              Full deployment (default)"
        echo "  secrets             Setup secrets only"
        echo "  health              Run health checks"
        echo "  cleanup, remove     Remove deployed functions"
        echo "  help                Show this help"
        echo ""
        echo "Environments:"
        echo "  staging             Staging environment (default)"
        echo "  production, prod    Production environment"
        echo "  development, dev    Development environment"
        echo ""
        echo "Options:"
        echo "  --dry-run           Show what would be done without executing"
        echo "  --force             Skip confirmation prompts"
        echo ""
        echo "Function Types (for specific cleanup):"
        echo "  gmail               Gmail operations function"
        echo "  calendar            Calendar operations function"
        echo "  drive               Drive operations function"
        echo "  account             Account management function"
        echo "  contacts            Contacts operations function"
        echo "  mcp-gateway         MCP Gateway function"
        echo "  qa-dashboard        QA Dashboard function"
        echo ""
        echo "Examples:"
        echo "  $0                           # Deploy to staging"
        echo "  $0 production                # Deploy to production"
        echo "  $0 deploy production         # Deploy to production"
        echo "  $0 secrets staging           # Setup secrets for staging"
        echo "  $0 health production         # Health check for production"
        echo "  $0 cleanup staging           # Remove all staging functions"
        echo "  $0 cleanup production --dry-run  # Preview production cleanup"
        echo "  $0 remove staging gmail      # Remove only gmail function from staging"
        echo "  $0 cleanup production --force    # Remove production functions without confirmation"
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac
