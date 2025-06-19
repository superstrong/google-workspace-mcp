interface SecurityContext {
  email: string;
  sourceIP: string;
  userAgent: string;
  timestamp: string;
}

interface AuditLogEntry {
  timestamp: string;
  userEmail: string;
  sourceIP: string;
  userAgent: string;
  operation: string;
  status: 'STARTED' | 'SUCCESS' | 'ERROR';
  metadata?: {
    executionTime?: number;
    error?: string;
    [key: string]: any;
  };
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export class AuditLogger {
  /**
   * Log security and operational events for compliance
   */
  static async logRequest(
    context: SecurityContext,
    operation: string,
    status: 'STARTED' | 'SUCCESS' | 'ERROR',
    metadata?: any
  ): Promise<void> {
    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      userEmail: context.email,
      sourceIP: context.sourceIP,
      userAgent: context.userAgent,
      operation,
      status,
      metadata,
      severity: status === 'ERROR' ? 'ERROR' : status === 'SUCCESS' ? 'INFO' : 'INFO'
    };

    // Log to Cloud Logging (structured logging)
    console.log(JSON.stringify({
      ...logEntry,
      '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
      serviceName: 'gmail-function',
      methodName: `gmail.${operation}`,
      resourceName: `users/${context.email}`,
      authenticationInfo: {
        principalEmail: context.email
      },
      requestMetadata: {
        callerIp: context.sourceIP,
        callerSuppliedUserAgent: context.userAgent
      }
    }));

    // For critical security events, also send alerts
    if (status === 'ERROR' && this.isCriticalSecurityEvent(operation, metadata)) {
      await this.sendSecurityAlert(logEntry);
    }
  }

  /**
   * Log data access events for compliance
   */
  static async logDataAccess(
    context: SecurityContext,
    dataType: 'email' | 'calendar' | 'drive',
    action: 'read' | 'write' | 'delete',
    resourceId?: string
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
      serviceName: 'gmail-function',
      methodName: `${dataType}.${action}`,
      resourceName: resourceId ? `${dataType}/${resourceId}` : `${dataType}/unknown`,
      authenticationInfo: {
        principalEmail: context.email
      },
      requestMetadata: {
        callerIp: context.sourceIP,
        callerSuppliedUserAgent: context.userAgent
      },
      severity: 'INFO'
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Determine if an event requires immediate security attention
   */
  private static isCriticalSecurityEvent(operation: string, metadata?: any): boolean {
    // Define critical security events
    const criticalEvents = [
      'authentication_failure',
      'unauthorized_access',
      'token_theft_attempt',
      'suspicious_activity'
    ];

    if (criticalEvents.includes(operation)) {
      return true;
    }

    // Check for suspicious patterns in metadata
    if (metadata?.error) {
      const suspiciousPatterns = [
        'multiple failed attempts',
        'invalid token',
        'unauthorized origin',
        'signature verification failed'
      ];

      return suspiciousPatterns.some(pattern => 
        metadata.error.toLowerCase().includes(pattern)
      );
    }

    return false;
  }

  /**
   * Send security alerts for critical events
   */
  private static async sendSecurityAlert(logEntry: AuditLogEntry): Promise<void> {
    // In a production environment, you would integrate with:
    // - Cloud Monitoring for alerts
    // - Pub/Sub for real-time notifications
    // - Email/SMS for critical alerts
    
    console.error('CRITICAL_SECURITY_ALERT:', JSON.stringify({
      ...logEntry,
      alertLevel: 'CRITICAL',
      requiresImmediateAttention: true
    }));

    // TODO: Implement actual alerting mechanism
    // - Send to Cloud Monitoring
    // - Trigger incident response
    // - Notify security team
  }

  /**
   * Log performance metrics for monitoring
   */
  static async logPerformance(
    operation: string,
    executionTime: number,
    memoryUsage?: number
  ): Promise<void> {
    const performanceLog = {
      timestamp: new Date().toISOString(),
      '@type': 'type.googleapis.com/google.cloud.monitoring.MetricData',
      serviceName: 'gmail-function',
      operation,
      metrics: {
        executionTime,
        memoryUsage: memoryUsage || process.memoryUsage().heapUsed
      }
    };

    console.log(JSON.stringify(performanceLog));
  }
}
