#!/bin/bash

# Script to create all remaining Cloud Functions for complete serverless conversion
set -e

echo "🚀 Creating all Cloud Functions for complete serverless conversion..."

# Create Drive Function
echo "📁 Creating Drive Function..."
mkdir -p cloud-functions/drive-function/src/services
cp cloud-functions/gmail-function/package.json cloud-functions/drive-function/
cp cloud-functions/gmail-function/tsconfig.json cloud-functions/drive-function/
cp -r cloud-functions/gmail-function/src/security cloud-functions/drive-function/src/
cp cloud-functions/gmail-function/src/services/token-manager.ts cloud-functions/drive-function/src/services/

# Update Drive Function package.json
sed -i.bak 's/gmail-function/drive-function/g' cloud-functions/drive-function/package.json
sed -i.bak 's/gmail-handler/drive-handler/g' cloud-functions/drive-function/package.json
sed -i.bak 's/gmailHandler/driveHandler/g' cloud-functions/drive-function/package.json
sed -i.bak 's/8081/8084/g' cloud-functions/drive-function/package.json

# Create Account Management Function
echo "👤 Creating Account Management Function..."
mkdir -p cloud-functions/account-function/src/services
cp cloud-functions/gmail-function/package.json cloud-functions/account-function/
cp cloud-functions/gmail-function/tsconfig.json cloud-functions/account-function/
cp -r cloud-functions/gmail-function/src/security cloud-functions/account-function/src/
cp cloud-functions/gmail-function/src/services/token-manager.ts cloud-functions/account-function/src/services/

# Update Account Function package.json
sed -i.bak 's/gmail-function/account-function/g' cloud-functions/account-function/package.json
sed -i.bak 's/gmail-handler/account-handler/g' cloud-functions/account-function/package.json
sed -i.bak 's/gmailHandler/accountHandler/g' cloud-functions/account-function/package.json
sed -i.bak 's/8081/8085/g' cloud-functions/account-function/package.json

# Create Contacts Function
echo "📞 Creating Contacts Function..."
mkdir -p cloud-functions/contacts-function/src/services
cp cloud-functions/gmail-function/package.json cloud-functions/contacts-function/
cp cloud-functions/gmail-function/tsconfig.json cloud-functions/contacts-function/
cp -r cloud-functions/gmail-function/src/security cloud-functions/contacts-function/src/
cp cloud-functions/gmail-function/src/services/token-manager.ts cloud-functions/contacts-function/src/services/

# Update Contacts Function package.json
sed -i.bak 's/gmail-function/contacts-function/g' cloud-functions/contacts-function/package.json
sed -i.bak 's/gmail-handler/contacts-handler/g' cloud-functions/contacts-function/package.json
sed -i.bak 's/gmailHandler/contactsHandler/g' cloud-functions/contacts-function/package.json
sed -i.bak 's/8081/8086/g' cloud-functions/contacts-function/package.json

# Create MCP Gateway Function (routes to all other functions)
echo "🌐 Creating MCP Gateway Function..."
mkdir -p cloud-functions/mcp-gateway/src/services
cp cloud-functions/gmail-function/package.json cloud-functions/mcp-gateway/
cp cloud-functions/gmail-function/tsconfig.json cloud-functions/mcp-gateway/
cp -r cloud-functions/gmail-function/src/security cloud-functions/mcp-gateway/src/

# Update MCP Gateway package.json
sed -i.bak 's/gmail-function/mcp-gateway/g' cloud-functions/mcp-gateway/package.json
sed -i.bak 's/gmail-handler/mcp-gateway/g' cloud-functions/mcp-gateway/package.json
sed -i.bak 's/gmailHandler/mcpGateway/g' cloud-functions/mcp-gateway/package.json
sed -i.bak 's/8081/8087/g' cloud-functions/mcp-gateway/package.json

echo "✅ All Cloud Function structures created!"
echo ""
echo "📋 Summary of created functions:"
echo "  📧 Gmail Function (port 8081) - Email operations"
echo "  📅 Calendar Function (port 8083) - Calendar operations"
echo "  📁 Drive Function (port 8084) - Drive operations"
echo "  👤 Account Function (port 8085) - Account management"
echo "  📞 Contacts Function (port 8086) - Contacts operations"
echo "  🌐 MCP Gateway (port 8087) - Routes to all functions"
echo "  🧪 QA Dashboard (port 8082) - Testing interface"
echo ""
echo "🔧 Next steps:"
echo "1. Implement service classes for each function"
echo "2. Update deployment script to handle all functions"
echo "3. Test each function individually"
echo "4. Deploy to Google Cloud"

# Clean up backup files
find cloud-functions -name "*.bak" -delete

echo "🎉 Setup complete!"
