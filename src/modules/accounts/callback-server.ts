import http from 'http';
import url from 'url';
import logger from '../../utils/logger.js';

export class OAuthCallbackServer {
  private static instance?: OAuthCallbackServer;
  private server?: http.Server;
  private port: number = 8080;
  private isRunning: boolean = false;
  private pendingPromises: Map<string, { resolve: (code: string) => void; reject: (error: Error) => void }> = new Map();
  private authHandler?: (code: string, state: string) => Promise<void>;
  
  private constructor() {}
  
  static getInstance(): OAuthCallbackServer {
    if (!OAuthCallbackServer.instance) {
      OAuthCallbackServer.instance = new OAuthCallbackServer();
    }
    return OAuthCallbackServer.instance;
  }
  
  async ensureServerRunning(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        
        // Handle the auto-complete endpoint
        if (parsedUrl.pathname === '/complete-auth' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              const { code, state } = JSON.parse(body);
              
              // Automatically complete the authentication
              if (this.authHandler) {
                await this.authHandler(code, state || 'default');
                logger.info('OAuth authentication completed automatically');
              }
              
              // Also resolve any pending promises (for backward compatibility)
              const pending = this.pendingPromises.get(state || 'default');
              if (pending) {
                pending.resolve(code);
                this.pendingPromises.delete(state || 'default');
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              logger.error('Failed to process auto-complete request:', error);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
          });
          return;
        }
        
        if (parsedUrl.pathname === '/') {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;
          const state = parsedUrl.query.state as string || 'default';
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            
            // Reject any pending promises
            const pending = this.pendingPromises.get(state);
            if (pending) {
              pending.reject(new Error(`OAuth error: ${error}`));
              this.pendingPromises.delete(state);
            }
            return;
          }
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head>
                  <title>Google OAuth Authorization Successful</title>
                  <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .success-message { 
                      background: #4CAF50; 
                      color: white; 
                      padding: 20px; 
                      border-radius: 5px; 
                      margin-bottom: 20px;
                      text-align: center;
                    }
                    .status { 
                      background: #e7f3ff; 
                      padding: 15px; 
                      border-left: 4px solid #2196F3;
                      margin: 20px 0;
                    }
                    .loading {
                      display: inline-block;
                      width: 20px;
                      height: 20px;
                      border: 3px solid #f3f3f3;
                      border-top: 3px solid #3498db;
                      border-radius: 50%;
                      animation: spin 1s linear infinite;
                      margin-left: 10px;
                      vertical-align: middle;
                    }
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                    .code-fallback {
                      font-family: monospace;
                      background: #f5f5f5;
                      padding: 10px;
                      margin: 10px 0;
                      word-break: break-all;
                      display: none;
                    }
                  </style>
                </head>
                <body>
                  <div class="success-message">
                    <h1>✅ Authorization Successful!</h1>
                  </div>
                  
                  <div class="status" id="status">
                    <h3>Completing authentication automatically...</h3>
                    <p>Please wait while we complete the authentication process <span class="loading"></span></p>
                  </div>
                  
                  <div class="code-fallback" id="codeFallback">
                    <p>If automatic authentication fails, you can manually copy this code:</p>
                    <code>${code}</code>
                  </div>
                  
                  <script>
                    // Automatically submit the authorization code to complete the flow
                    async function completeAuth() {
                      try {
                        // Send the code to a special endpoint that will trigger the promise resolution
                        const response = await fetch('/complete-auth', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ 
                            code: '${code}',
                            state: '${state}'
                          })
                        });
                        
                        if (response.ok) {
                          document.getElementById('status').innerHTML = 
                            '<h3>✅ Authentication Complete!</h3>' +
                            '<p>You can now close this window and return to Claude Desktop.</p>';
                        } else {
                          throw new Error('Failed to complete authentication');
                        }
                      } catch (error) {
                        console.error('Auto-complete failed:', error);
                        document.getElementById('status').innerHTML = 
                          '<h3>⚠️ Automatic completion failed</h3>' +
                          '<p>Please copy the code below and paste it back to Claude Desktop:</p>';
                        document.getElementById('codeFallback').style.display = 'block';
                      }
                    }
                    
                    // Start the auto-completion process
                    setTimeout(completeAuth, 500);
                  </script>
                </body>
              </html>
            `);
            
            // Immediately trigger the authentication completion
            // by posting to our own complete-auth endpoint
            // Don't resolve here anymore - let the auto-complete endpoint handle it
            return;
          }
        }
        
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Not Found</h1></body></html>');
      });
      
      this.server.listen(this.port, () => {
        this.isRunning = true;
        logger.info(`OAuth callback server listening on http://localhost:${this.port}`);
        resolve();
      });
      
      this.server.on('error', (err) => {
        this.isRunning = false;
        reject(err);
      });
    });
  }
  
  async waitForAuthorizationCode(sessionId: string = 'default'): Promise<string> {
    await this.ensureServerRunning();
    
    return new Promise((resolve, reject) => {
      // Store the promise resolvers for this session
      this.pendingPromises.set(sessionId, { resolve, reject });
      
      // Set a timeout to avoid hanging forever
      setTimeout(() => {
        if (this.pendingPromises.has(sessionId)) {
          this.pendingPromises.delete(sessionId);
          reject(new Error('OAuth timeout - no authorization received within 5 minutes'));
        }
      }, 5 * 60 * 1000); // 5 minutes timeout
    });
  }
  
  getCallbackUrl(): string {
    return `http://localhost:${this.port}`;
  }
  
  isServerRunning(): boolean {
    return this.isRunning;
  }

  setAuthHandler(handler: (code: string, state: string) => Promise<void>) {
    this.authHandler = handler;
  }
}
