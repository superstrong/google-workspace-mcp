import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { SecurityMiddleware } from './security/auth-middleware.js';
import { TokenManager } from './services/token-manager.js';
import { AuditLogger } from './security/audit-logger.js';

interface AccountRequest {
  operation: 'authenticate' | 'refresh' | 'revoke' | 'status';
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

export const accountHandler: HttpFunction = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Security Layer 1: Authentication & Authorization
    securityContext = await SecurityMiddleware.authenticate(req);
    
    // Security Layer 2: Request Validation
    const accountRequest = await SecurityMiddleware.validateRequest(req.body as AccountRequest);
    
    // Audit logging
    await AuditLogger.logRequest(securityContext, accountRequest.operation, 'STARTED');

    // Initialize Token Manager
    const tokenManager = new TokenManager();

    // Route to appropriate handler
    let result;
    switch (accountRequest.operation) {
      case 'authenticate':
        result = await tokenManager.validateToken(accountRequest.email);
        break;
      case 'refresh':
        result = await tokenManager.getValidToken(accountRequest.email);
        break;
      case 'revoke':
        result = await tokenManager.removeToken(accountRequest.email);
        break;
      case 'status':
        result = await tokenManager.listAccounts();
        break;
      default:
        throw new Error(`Unsupported operation: ${accountRequest.operation}`);
    }

    // Security Layer 4: Response Sanitization
    const sanitizedResult = await SecurityMiddleware.sanitizeResponse(result, securityContext);

    // Audit logging
    await AuditLogger.logRequest(securityContext, accountRequest.operation, 'SUCCESS', {
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
