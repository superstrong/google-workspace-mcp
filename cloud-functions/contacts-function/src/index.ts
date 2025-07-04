import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { SecurityMiddleware } from './security/auth-middleware.js';
import { TokenManager } from './services/token-manager.js';
import { AuditLogger } from './security/audit-logger.js';

interface ContactsRequest {
  operation: 'list' | 'get' | 'create' | 'update' | 'delete' | 'search';
  email: string;
  params: any;
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

export const contactsHandler: HttpFunction = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Security Layer 1: Authentication & Authorization
    securityContext = await SecurityMiddleware.authenticate(req);
    
    // Security Layer 2: Request Validation
    const contactsRequest = await SecurityMiddleware.validateRequest(req.body as ContactsRequest);
    
    // Audit logging
    await AuditLogger.logRequest(securityContext, contactsRequest.operation, 'STARTED');

    // Get authenticated token
    const tokenManager = new TokenManager();
    const token = await tokenManager.getValidToken(contactsRequest.email);

    // Initialize Contacts service (placeholder - would need actual implementation)
    // const contactsService = new ContactsService(token);

    // Route to appropriate handler
    let result;
    switch (contactsRequest.operation) {
      case 'list':
        result = { message: 'Contacts list operation', operation: 'list' };
        break;
      case 'get':
        result = { message: 'Contacts get operation', operation: 'get' };
        break;
      case 'create':
        result = { message: 'Contacts create operation', operation: 'create' };
        break;
      case 'update':
        result = { message: 'Contacts update operation', operation: 'update' };
        break;
      case 'delete':
        result = { message: 'Contacts delete operation', operation: 'delete' };
        break;
      case 'search':
        result = { message: 'Contacts search operation', operation: 'search' };
        break;
      default:
        throw new Error(`Unsupported operation: ${contactsRequest.operation}`);
    }

    // Security Layer 4: Response Sanitization
    const sanitizedResult = await SecurityMiddleware.sanitizeResponse(result, securityContext);

    // Audit logging
    await AuditLogger.logRequest(securityContext, contactsRequest.operation, 'SUCCESS', {
      executionTime: Date.now() - startTime
    });

    res.status(200).json({
      status: 'success',
      data: sanitizedResult,
      metadata: {
        executionTime: Date.now() - startTime,
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
      status: 'error',
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
