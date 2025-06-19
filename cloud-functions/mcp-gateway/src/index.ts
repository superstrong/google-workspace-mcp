import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { SecurityMiddleware } from './security/auth-middleware.js';
import { AuditLogger } from './security/audit-logger.js';

interface MCPRequest {
  tool: string;
  arguments: any;
  metadata?: {
    isSimulation?: boolean;
    originalEventId?: string;
    testPrompt?: string;
  };
}

interface SecurityContext {
  email: string;
  sourceIP: string;
  userAgent: string;
  timestamp: string;
}

// Function URL mapping
const FUNCTION_URLS = {
  // Account Management
  'list_workspace_accounts': 'account',
  'authenticate_workspace_account': 'account',
  'remove_workspace_account': 'account',
  
  // Gmail Operations
  'search_workspace_emails': 'gmail',
  'send_workspace_email': 'gmail',
  'get_workspace_gmail_settings': 'gmail',
  'manage_workspace_draft': 'gmail',
  'manage_workspace_label': 'gmail',
  'manage_workspace_label_assignment': 'gmail',
  'manage_workspace_label_filter': 'gmail',
  'manage_workspace_attachment': 'gmail',
  
  // Calendar Operations
  'list_workspace_calendar_events': 'calendar',
  'get_workspace_calendar_event': 'calendar',
  'create_workspace_calendar_event': 'calendar',
  'manage_workspace_calendar_event': 'calendar',
  'delete_workspace_calendar_event': 'calendar',
  
  // Drive Operations
  'list_drive_files': 'drive',
  'search_drive_files': 'drive',
  'upload_drive_file': 'drive',
  'download_drive_file': 'drive',
  'create_drive_folder': 'drive',
  'update_drive_permissions': 'drive',
  'delete_drive_file': 'drive',
  
  // Contacts Operations
  'get_workspace_contacts': 'contacts'
};

export const mcpGateway: HttpFunction = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Handle different request formats
    let mcpRequest: MCPRequest;
    
    if (req.body.tool && req.body.arguments) {
      // MCP protocol format
      mcpRequest = {
        tool: req.body.tool,
        arguments: req.body.arguments,
        metadata: req.body.metadata
      };
    } else if (req.body.operation) {
      // Direct function call format
      mcpRequest = {
        tool: req.body.operation,
        arguments: req.body,
        metadata: req.body.metadata
      };
    } else {
      throw new Error('Invalid request format. Expected MCP tool call or direct function call.');
    }

    // Security Layer 1: Authentication & Authorization
    securityContext = await SecurityMiddleware.authenticate(req);
    
    // Audit logging
    await AuditLogger.logRequest(securityContext, mcpRequest.tool, 'STARTED');

    // Determine target function
    const targetFunction = FUNCTION_URLS[mcpRequest.tool as keyof typeof FUNCTION_URLS];
    if (!targetFunction) {
      throw new Error(`Unknown tool: ${mcpRequest.tool}`);
    }

    // Route to appropriate function
    const result = await routeToFunction(targetFunction, mcpRequest, req);

    // Audit logging
    await AuditLogger.logRequest(securityContext, mcpRequest.tool, 'SUCCESS', {
      executionTime: Date.now() - startTime,
      targetFunction
    });

    // Return MCP-compatible response
    res.status(200).json({
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }],
      _meta: {
        executionTime: Date.now() - startTime,
        targetFunction,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // Security audit logging
    if (securityContext) {
      await AuditLogger.logRequest(securityContext, 'unknown', 'ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      });
    }

    // Error response
    const statusCode = error instanceof Error && error.message.includes('Unauthorized') ? 403 : 500;
    res.status(statusCode).json({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'error',
          error: error instanceof Error ? error.message : 'Internal server error',
          timestamp: new Date().toISOString()
        }, null, 2)
      }],
      isError: true,
      _meta: {
        executionTime: Date.now() - startTime
      }
    });
  }
};

/**
 * Route request to appropriate Cloud Function
 */
async function routeToFunction(functionName: string, mcpRequest: MCPRequest, originalReq: Request): Promise<any> {
  const environment = process.env.ENVIRONMENT || 'staging';
  const region = process.env.REGION || 'us-central1';
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  
  // Construct function URL
  const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/${functionName}-handler-${environment}`;
  
  // Prepare request payload based on function type
  let payload: any;
  
  switch (functionName) {
    case 'account':
      payload = {
        operation: mapToolToOperation(mcpRequest.tool),
        ...mcpRequest.arguments,
        metadata: mcpRequest.metadata
      };
      break;
      
    case 'gmail':
      payload = {
        operation: mapGmailToolToOperation(mcpRequest.tool),
        email: mcpRequest.arguments.email,
        params: mcpRequest.arguments,
        metadata: mcpRequest.metadata
      };
      break;
      
    case 'calendar':
      payload = {
        operation: mapCalendarToolToOperation(mcpRequest.tool),
        email: mcpRequest.arguments.email,
        params: mcpRequest.arguments,
        metadata: mcpRequest.metadata
      };
      break;
      
    case 'drive':
      payload = {
        operation: mapDriveToolToOperation(mcpRequest.tool),
        email: mcpRequest.arguments.email,
        params: mcpRequest.arguments,
        metadata: mcpRequest.metadata
      };
      break;
      
    case 'contacts':
      payload = {
        operation: 'get',
        email: mcpRequest.arguments.email,
        params: mcpRequest.arguments,
        metadata: mcpRequest.metadata
      };
      break;
      
    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
  
  // Forward authentication headers
  const headers: any = {
    'Content-Type': 'application/json',
    'User-Agent': 'MCP-Gateway/1.0'
  };
  
  if (originalReq.get('Authorization')) {
    headers['Authorization'] = originalReq.get('Authorization');
  }
  
  if (originalReq.get('X-Request-Signature')) {
    headers['X-Request-Signature'] = originalReq.get('X-Request-Signature');
  }
  
  // Make request to target function
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Function call failed (${response.status}): ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Map MCP tool names to function operations
 */
function mapToolToOperation(tool: string): string {
  const toolMap: { [key: string]: string } = {
    'list_workspace_accounts': 'list',
    'authenticate_workspace_account': 'authenticate',
    'remove_workspace_account': 'remove'
  };
  
  return toolMap[tool] || tool;
}

function mapGmailToolToOperation(tool: string): string {
  const toolMap: { [key: string]: string } = {
    'search_workspace_emails': 'search',
    'send_workspace_email': 'send',
    'get_workspace_gmail_settings': 'settings',
    'manage_workspace_draft': 'draft',
    'manage_workspace_label': 'label',
    'manage_workspace_label_assignment': 'label_assignment',
    'manage_workspace_label_filter': 'label_filter',
    'manage_workspace_attachment': 'attachment'
  };
  
  return toolMap[tool] || tool;
}

function mapCalendarToolToOperation(tool: string): string {
  const toolMap: { [key: string]: string } = {
    'list_workspace_calendar_events': 'list',
    'get_workspace_calendar_event': 'get',
    'create_workspace_calendar_event': 'create',
    'manage_workspace_calendar_event': 'manage',
    'delete_workspace_calendar_event': 'delete'
  };
  
  return toolMap[tool] || tool;
}

function mapDriveToolToOperation(tool: string): string {
  const toolMap: { [key: string]: string } = {
    'list_drive_files': 'list',
    'search_drive_files': 'search',
    'upload_drive_file': 'upload',
    'download_drive_file': 'download',
    'create_drive_folder': 'create_folder',
    'update_drive_permissions': 'update_permissions',
    'delete_drive_file': 'delete'
  };
  
  return toolMap[tool] || tool;
}
