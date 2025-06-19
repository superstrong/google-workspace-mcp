import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import crypto from 'crypto';

interface SecurityContext {
  email: string;
  sourceIP: string;
  userAgent: string;
  timestamp: string;
}

interface GmailRequest {
  operation: string;
  email: string;
  params: any;
  metadata?: {
    isSimulation?: boolean;
    originalEventId?: string;
    testPrompt?: string;
  };
}

export class SecurityMiddleware {
  private static secretManager = new SecretManagerServiceClient();
  private static readonly PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
  
  // Allowed Apps Script origins for security
  private static readonly ALLOWED_ORIGINS = [
    'script.google.com',
    'script.googleusercontent.com'
  ];

  /**
   * Multi-layer authentication and authorization
   */
  static async authenticate(req: Request): Promise<SecurityContext> {
    const startTime = Date.now();
    
    try {
      // Layer 1: Extract and verify JWT token
      const token = this.extractJWT(req);
      const payload = await this.verifyJWT(token);
      
      // Layer 2: Verify Apps Script origin
      await this.verifyAppsScriptOrigin(req, payload);
      
      // Layer 3: Verify user permissions
      await this.verifyUserPermissions(payload.email, req.body?.operation);
      
      // Layer 4: Request integrity verification
      await this.verifyRequestIntegrity(req);
      
      // Create security context
      const securityContext: SecurityContext = {
        email: payload.email,
        sourceIP: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date().toISOString()
      };
      
      return securityContext;
      
    } catch (error) {
      // Log security failure
      await this.logSecurityEvent('AUTH_FAILURE', req, error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract JWT token from request headers
   */
  private static extractJWT(req: Request): string {
    const authHeader = req.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header');
    }
    
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Verify JWT token signature and claims
   */
  private static async verifyJWT(token: string): Promise<any> {
    try {
      // Get JWT secret from Secret Manager
      const secretName = `projects/${this.PROJECT_ID}/secrets/jwt-secret/versions/latest`;
      const [version] = await this.secretManager.accessSecretVersion({ name: secretName });
      const secret = version.payload?.data?.toString();
      
      if (!secret) {
        throw new Error('JWT secret not found');
      }
      
      // Verify token
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        maxAge: '1h' // Token expires in 1 hour
      });
      
      return payload;
      
    } catch (error) {
      throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Invalid token'}`);
    }
  }

  /**
   * Verify request comes from authorized Apps Script
   */
  private static async verifyAppsScriptOrigin(req: Request, payload: any): Promise<void> {
    const origin = req.get('Origin') || req.get('Referer');
    
    if (!origin) {
      throw new Error('Missing origin header');
    }
    
    const isAllowedOrigin = this.ALLOWED_ORIGINS.some(allowedOrigin => 
      origin.includes(allowedOrigin)
    );
    
    if (!isAllowedOrigin) {
      throw new Error(`Unauthorized origin: ${origin}`);
    }
    
    // Additional Apps Script specific validation
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent.includes('GoogleAppsScript')) {
      throw new Error('Request not from Google Apps Script');
    }
  }

  /**
   * Verify user has permission for the requested operation
   */
  private static async verifyUserPermissions(email: string, operation: string): Promise<void> {
    // Get user permissions from Firestore
    // For now, we'll implement basic email domain validation
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address');
    }
    
    // Add domain-based restrictions if needed
    // const allowedDomains = ['yourdomain.com'];
    // const domain = email.split('@')[1];
    // if (!allowedDomains.includes(domain)) {
    //   throw new Error(`Domain ${domain} not authorized`);
    // }
  }

  /**
   * Verify request integrity using HMAC signature
   */
  private static async verifyRequestIntegrity(req: Request): Promise<void> {
    const signature = req.get('X-Request-Signature');
    if (!signature) {
      // For development, we might skip this
      if (process.env.NODE_ENV === 'development') {
        return;
      }
      throw new Error('Missing request signature');
    }
    
    // Get signing secret from Secret Manager
    const secretName = `projects/${this.PROJECT_ID}/secrets/request-signing-secret/versions/latest`;
    const [version] = await this.secretManager.accessSecretVersion({ name: secretName });
    const secret = version.payload?.data?.toString();
    
    if (!secret) {
      throw new Error('Request signing secret not found');
    }
    
    // Verify HMAC signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      throw new Error('Request signature verification failed');
    }
  }

  /**
   * Validate and sanitize request data
   */
  static async validateRequest(body: any): Promise<GmailRequest> {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid request body');
    }
    
    const { operation, email, params, metadata } = body;
    
    // Validate required fields
    if (!operation || typeof operation !== 'string') {
      throw new Error('Operation is required and must be a string');
    }
    
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Valid email address is required');
    }
    
    // Validate operation type
    const allowedOperations = ['search', 'send', 'draft', 'label', 'attachment', 'settings'];
    if (!allowedOperations.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}`);
    }
    
    // Sanitize and validate params
    const sanitizedParams = this.sanitizeParams(params);
    
    return {
      operation,
      email,
      params: sanitizedParams,
      metadata
    };
  }

  /**
   * Sanitize parameters to prevent injection attacks
   */
  private static sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') {
      return {};
    }
    
    // Deep clone and sanitize
    const sanitized = JSON.parse(JSON.stringify(params));
    
    // Remove any potentially dangerous fields
    const dangerousFields = ['__proto__', 'constructor', 'prototype'];
    dangerousFields.forEach(field => {
      delete sanitized[field];
    });
    
    return sanitized;
  }

  /**
   * Sanitize response data before sending
   */
  static async sanitizeResponse(data: any, context: SecurityContext): Promise<any> {
    // Remove sensitive information
    if (data && typeof data === 'object') {
      const sanitized = JSON.parse(JSON.stringify(data));
      
      // Remove token information if present
      delete sanitized.token;
      delete sanitized.access_token;
      delete sanitized.refresh_token;
      
      // Add security metadata
      sanitized._security = {
        sanitized: true,
        timestamp: new Date().toISOString(),
        userEmail: context.email
      };
      
      return sanitized;
    }
    
    return data;
  }

  /**
   * Log security events for audit trail
   */
  private static async logSecurityEvent(eventType: string, req: Request, error?: any): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      sourceIP: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      origin: req.get('Origin') || req.get('Referer') || 'unknown',
      error: error instanceof Error ? error.message : error,
      severity: 'WARNING'
    };
    
    // Log to Cloud Logging (console.error goes to Cloud Logging in Cloud Functions)
    console.error('SECURITY_EVENT:', JSON.stringify(logEntry));
  }
}
